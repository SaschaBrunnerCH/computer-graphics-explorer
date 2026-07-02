import { useEffect, useRef, useState } from "react";
import Camera from "@arcgis/core/Camera.js";
import Point from "@arcgis/core/geometry/Point.js";
import SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import SpatialReference from "@arcgis/core/geometry/SpatialReference.js";
import type SceneView from "@arcgis/core/views/SceneView.js";
import RenderNode from "@arcgis/core/views/3d/webgl/RenderNode.js";
import type ManagedFBO from "@arcgis/core/views/3d/webgl/ManagedFBO.js";
import type RenderCamera from "@arcgis/core/views/3d/webgl/RenderCamera.js";
import type { SunLight } from "@arcgis/core/views/3d/webgl/types.js";
import type { RenderNodeOutput, ConsumedNodes } from "@arcgis/core/views/3d/webgl.js";
import * as webgl from "@arcgis/core/views/3d/webgl.js";
import "@arcgis/map-components/components/arcgis-scene";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Real Monte-Carlo path tracing, converging live over the rasterized city.
 * This is HybridRay's analytic scene — spheres over the Limmat, primary
 * visibility of Zurich left to the engine's triangle rasterizer — but the
 * spheres are shaded by tracing STOCHASTIC light paths instead of a closed-form
 * Lambert term. Each frame casts exactly ONE random path per pixel; a RenderNode
 * that HOLDS a framebuffer across frames averages that new sample into the
 * running estimate (SceneMotionBlur's retain/release trick), and the image
 * converges from noise toward the true solution of the rendering equation. No
 * direct-light sampling: rays find the emissive sphere by chance, so the light
 * is made generous (r5, emission ~8×) and convergence is visible in ~100 SPP.
 *
 * The physics that falls out for free: global illumination. A diffuse bounce
 * multiplies the path's throughput by the surface albedo, so a ray that grazes
 * the crimson sphere before reaching the light carries crimson onto whatever it
 * lands on next — you can watch red and teal bleed onto the big white wall. That
 * colour bleeding is not a shader trick; it is the direct consequence of
 * integrating many random paths.
 *
 * Honest limits, same as HybridRay: the city is rasterized and takes no part in
 * light transport — only the five analytic spheres participate. The emissive
 * sphere is synthetic; escaped rays see a dimmed procedural sky, never the real
 * buildings. The accumulation target is 8-bit (RGBA8), so deep in the noise you
 * will see faint banding — an honest artefact of averaging into a byte buffer.
 * RenderNode is an experimental, expert-level public API.
 *
 * Two verified lessons baked in: (1) fullscreen passes must land on
 * "composite-color" — drawing into "opaque-color" gets silently erased by the
 * engine's downstream resolve; (2) rays are built WITHOUT a matrix inversion —
 * the RenderCamera hands us eye/center/up plus the two field-of-view angles, and
 * every sphere centre is passed EYE-RELATIVE so float32 stays exact near the
 * camera.
 */

/** Zurich, over the Limmat by the Rathaus — the sphere cluster floats here. */
const ANCHOR_LON = 8.5417;
const ANCHOR_LAT = 47.3717;
/** Metres above local ground the sphere field is centred on. */
const ANCHOR_LIFT = 30;
/** Used if the elevation query fails; the river sits at ~405 m. */
const FALLBACK_GROUND_Z = 405;

/** OSM 3D buildings give the rasterized city real depth for the composite. */
const OSM_BUILDINGS_URL =
  "https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer";
const OSM_BUILDINGS_ID = "osm-3d-buildings-path-trace";

const METERS_PER_DEG_LAT = 111320;
const METERS_PER_DEG_LON = METERS_PER_DEG_LAT * Math.cos((ANCHOR_LAT * Math.PI) / 180);

/**
 * Five spheres, as local (east, north, up) offsets in metres from the anchor,
 * with radius, diffuse albedo and emission. Three diffuse spheres cluster
 * within ~25 m so they bounce colour onto each other; one small warm-white
 * EMISSIVE sphere above-left is the only real light besides the dimmed sky; one
 * large white diffuse sphere below-behind acts as a "wall" that catches the
 * bounced colour — the visible face of global illumination.
 */
const SPHERES = [
  // White diffuse — the reference sphere the crimson/teal bleed onto.
  { east: 0, north: 0, up: 4, radius: 8, albedo: [0.9, 0.9, 0.92], emission: [0, 0, 0] },
  // Crimson diffuse — bleeds red onto its neighbours.
  { east: 13, north: -2, up: 2, radius: 7, albedo: [0.75, 0.07, 0.09], emission: [0, 0, 0] },
  // Teal diffuse — bleeds green-blue onto its neighbours.
  { east: -12, north: 3, up: 5, radius: 6, albedo: [0.06, 0.62, 0.58], emission: [0, 0, 0] },
  // Emissive light — warm white, ~8×; the only light besides the dim sky.
  { east: -16, north: -3, up: 27, radius: 5, albedo: [0, 0, 0], emission: [9.0, 7.5, 5.2] },
  // Large white "wall" below-behind the cluster — catches visible colour bleeding.
  { east: 3, north: 30, up: -18, radius: 18, albedo: [0.86, 0.86, 0.86], emission: [0, 0, 0] },
] as const;

const SPHERE_COUNT = SPHERES.length;

/** Constant per-sphere data (only the eye-relative centres change per frame). */
const RADII = new Float32Array(SPHERES.map((s) => s.radius));
const ALBEDO = new Float32Array(SPHERES.flatMap((s) => [...s.albedo]));
const EMISSION = new Float32Array(SPHERES.flatMap((s) => [...s.emission]));

/** Hard cap on samples per pixel — the loop self-drives until here, then idles. */
const MAX_SAMPLES = 512;

const VERT = `#version 300 es
out vec2 vUv;
void main() {
  // One triangle covering the screen: (-1,-1) (3,-1) (-1,3).
  vec2 pos = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  vUv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

/**
 * The trace pass. Per pixel per frame it casts ONE stochastic path and blends
 * the resulting radiance into the running average kept in `uAccumPrev` with
 * weight `uInvSample` = 1/n. Alpha carries the primary-hit mask (fractional at
 * silhouettes thanks to sub-pixel jitter, which antialiases the sphere edges).
 */
const TRACE_FRAG = `#version 300 es
precision highp float;
precision highp int;

#define N 5

uniform sampler2D uAccumPrev; // running average from last frame (rgb + mask in a)
uniform sampler2D uDepth;     // the rasterized city's depth attachment
uniform float uNear;
uniform float uFar;

uniform vec3 uForward;        // camera basis, render coords, per frame
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uTanX;          // tan(fovX / 2)
uniform float uTanY;          // tan(fovY / 2)

uniform vec3 uCenters[N];     // sphere centres, EYE-RELATIVE (centre - eye)
uniform float uRadii[N];
uniform vec3 uAlbedo[N];
uniform vec3 uEmission[N];    // 0 for diffuse spheres; warm & bright for the light

uniform vec3 uSunDir;         // L: toward the sun, unit — only orients the sky
uniform float uSkyDim;        // dims the procedural sky so the light dominates
uniform int uBounces;         // 1..4 diffuse bounces per path
uniform vec2 uResolution;     // drawing-buffer size, for the sub-pixel jitter
uniform uint uFrame;          // accumulation index n, reseeds the RNG each frame
uniform float uInvSample;     // 1/n (or 1.0 in single-sample mode)

in vec2 vUv;
out vec4 fragColor;

const float EPS = 1e-2;
const float PI = 3.14159265;

// PCG hash → uniform float in [0,1); advances the state in place.
uint pcg(inout uint state) {
  state = state * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
float randf(inout uint state) {
  return float(pcg(state)) * (1.0 / 4294967296.0);
}

// View-axis distance of the engine's rasterized scene, in metres, undoing the
// perspective depth non-linearity with the SceneView's near/far (Esri's DoF
// formula — the same one HybridRay uses for its composite).
float sceneDist(vec2 uv) {
  float d = texture(uDepth, uv).r;
  float ndc = d * 2.0 - 1.0;
  return abs((2.0 * uNear * uFar) / (ndc * (uFar - uNear) - (uFar + uNear)));
}

// Nearest sphere hit for ray ro + t*rd (rd unit). Writes bestT / bestI (-1 = miss).
void hitSpheres(vec3 ro, vec3 rd, out float bestT, out int bestI) {
  bestT = 1e20;
  bestI = -1;
  for (int i = 0; i < N; i++) {
    vec3 oc = ro - uCenters[i];
    float b = dot(oc, rd);
    float c = dot(oc, oc) - uRadii[i] * uRadii[i];
    float disc = b * b - c;
    if (disc < 0.0) continue;
    float s = sqrt(disc);
    float t = -b - s;
    if (t < EPS) t = -b + s; // ray started inside: take the far root
    if (t > EPS && t < bestT) {
      bestT = t;
      bestI = i;
    }
  }
}

// A dimmed procedural sky, matched to the sun direction; escaped rays sample
// THIS (never the rasterized city). Kept faint so the emissive sphere dominates.
vec3 skyColor(vec3 dir) {
  float h = clamp(dot(dir, uUp) * 0.5 + 0.5, 0.0, 1.0);
  vec3 sky = mix(vec3(0.78, 0.84, 0.93), vec3(0.19, 0.42, 0.79), h);
  float sun = smoothstep(0.9975, 0.9996, dot(dir, uSunDir));
  return sky + vec3(1.0, 0.94, 0.78) * sun * 2.0;
}

// Cosine-weighted hemisphere sample around n. With this importance sampling the
// Lambertian estimator reduces to multiplying throughput by the albedo (the pdf
// cancels the cosine term), so the bounce loop needs no explicit 1/pi or cosine.
vec3 cosineHemisphere(vec3 n, inout uint state) {
  float u1 = randf(state);
  float u2 = randf(state);
  float r = sqrt(u1);
  float phi = 2.0 * PI * u2;
  float x = r * cos(phi);
  float y = r * sin(phi);
  float z = sqrt(max(0.0, 1.0 - u1));
  // Build an orthonormal tangent frame from n (guard against n ≈ ±z).
  vec3 up = abs(n.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 t = normalize(cross(up, n));
  vec3 bt = cross(n, t);
  return normalize(t * x + bt * y + n * z);
}

void main() {
  vec4 prev = texture(uAccumPrev, vUv);

  // Seed the RNG from the pixel and the accumulation index so every frame draws
  // a fresh path. Churn once so nearby seeds decorrelate.
  uint seed =
    uint(gl_FragCoord.x) * 1973u + uint(gl_FragCoord.y) * 9277u + uFrame * 26699u + 1u;
  pcg(seed);

  // Primary ray with a sub-pixel jitter: origin is the eye (vec3(0)), direction
  // from the camera basis. The jitter antialiases the sphere silhouettes because
  // the primary-hit mask averages to a fractional value at the edges.
  vec2 jitter = (vec2(randf(seed), randf(seed)) - 0.5) / uResolution;
  vec2 ndc = (vUv + jitter) * 2.0 - 1.0;
  vec3 primary = normalize(uForward + ndc.x * uTanX * uRight + ndc.y * uTanY * uUp);

  float t0;
  int idx0;
  hitSpheres(vec3(0.0), primary, t0, idx0);
  if (idx0 < 0) {
    fragColor = vec4(0.0); // no sphere here → a city pixel (mask 0)
    return;
  }
  // Depth composite: a nearer building occludes the sphere → treat as city.
  if (sceneDist(vUv) < t0 * dot(primary, uForward)) {
    fragColor = vec4(0.0);
    return;
  }

  // Naive path tracing: iterate diffuse bounces, terminating on the light or the
  // sky. The loop bound is a WebGL constant; we break at uBounces.
  vec3 throughput = vec3(1.0);
  vec3 radiance = vec3(0.0);
  int idx = idx0;
  vec3 hitP = primary * t0;
  for (int b = 0; b <= 4; b++) {
    vec3 em = uEmission[idx];
    if (dot(em, vec3(1.0)) > 0.0) {
      radiance += throughput * em; // reached the light → collect and stop
      break;
    }
    throughput *= uAlbedo[idx];    // diffuse bounce: attenuate by albedo
    if (b >= uBounces) break;      // spent the bounce budget without finding light
    vec3 n = normalize(hitP - uCenters[idx]);
    vec3 dir = cosineHemisphere(n, seed);
    vec3 ro = hitP + n * EPS;
    float t;
    int nidx;
    hitSpheres(ro, dir, t, nidx);
    if (nidx < 0) {
      radiance += throughput * skyColor(dir) * uSkyDim; // escaped → dim sky
      break;
    }
    hitP = ro + dir * t;
    idx = nidx;
  }

  // Blend this sample into the running average. uInvSample = 1/n gives an exact
  // running mean; in single-sample mode it is 1.0, so the buffer shows the raw
  // (pure-noise) estimate. Alpha averages the primary-hit mask the same way.
  vec3 avg = mix(prev.rgb, radiance, uInvSample);
  float mask = mix(prev.a, 1.0, uInvSample);
  fragColor = vec4(avg, mask);
}`;

/**
 * The composite pass. Blends the averaged trace over the untouched rasterized
 * city by the primary-hit mask, so city pixels (mask 0) show through unchanged
 * and traced pixels (mask 1) show the converging estimate.
 */
const COMPOSITE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uCity;   // the rasterized city (composite-color input)
uniform sampler2D uAccum;  // the running trace average (rgb) + mask (a)
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec3 city = texture(uCity, vUv).rgb;
  vec4 acc = texture(uAccum, vUv);
  fragColor = vec4(mix(city, acc.rgb, acc.a), 1.0);
}`;

/**
 * The path-tracing node. Sphere centres arrive in render coordinates (computed
 * once the view is ready); the camera basis, eye-relative centres and sun are
 * recomputed each frame from `this.camera` / `this.sunLight`. A retained accum
 * framebuffer carries the running average across frames.
 *
 * Built with `RenderNode.createSubclass` (the SDK's no-decorator path) because
 * Vite's react plugin can't parse the `@subclass` decorator form.
 */
interface PathTraceNode extends RenderNode {
  /** Sphere centres in render coordinates: [x0,y0,z0, ...] (float64). */
  centers: number[];
  /** Diffuse bounce budget 1..4; the slider writes this then requestRender()s. */
  bounces: number;
  /** When true, the resolve shows the raw current sample (pure noise). */
  single: boolean;
  /** Set when shader compilation failed — render then passes frames through. */
  broken: boolean;
  /** Called once if compilation fails so the UI can say so honestly. */
  onBroken: (() => void) | null;
  /** Called (throttled) with the live sample count so the caption can show SPP. */
  onSample: ((n: number) => void) | null;
  /** Index n of the sample being accumulated this frame (1-based). */
  sampleIndex: number;
  /** The running-average framebuffer retained from last frame, or null on reset. */
  _accum: ManagedFBO | null;
  _accW: number;
  _accH: number;
  /** Signature of the camera the accumulation belongs to; a change resets it. */
  _camSig: Float64Array | null;
  _lastBounces: number;
  _lastSingle: boolean;
  _traceProgram?: WebGLProgram | null;
  _traceVao?: WebGLVertexArrayObject | null;
  _traceLoc?: Record<string, WebGLUniformLocation | null>;
  _compositeProgram?: WebGLProgram | null;
  _compositeVao?: WebGLVertexArrayObject | null;
  _compositeLoc?: Record<string, WebGLUniformLocation | null>;
  /** Drop the held accum FBO (call before destroying the node). */
  releaseAccum: () => void;
}

const TRACE_UNIFORMS = [
  "uAccumPrev",
  "uDepth",
  "uNear",
  "uFar",
  "uForward",
  "uRight",
  "uUp",
  "uTanX",
  "uTanY",
  "uCenters",
  "uRadii",
  "uAlbedo",
  "uEmission",
  "uSunDir",
  "uSkyDim",
  "uBounces",
  "uResolution",
  "uFrame",
  "uInvSample",
] as const;

const COMPOSITE_UNIFORMS = ["uCity", "uAccum"] as const;

const makeProgram = (
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string,
): WebGLProgram | null => {
  const make = (type: number, src: string): WebGLShader | null => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      gl.deleteShader(s);
      return null;
    }
    return s;
  };
  const vs = make(gl.VERTEX_SHADER, vertSrc);
  const fs = make(gl.FRAGMENT_SHADER, fragSrc);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  return program;
};

const compilePrograms = (node: PathTraceNode, gl: WebGL2RenderingContext): boolean => {
  const trace = makeProgram(gl, VERT, TRACE_FRAG);
  const composite = makeProgram(gl, VERT, COMPOSITE_FRAG);
  if (!trace || !composite) return false;
  node._traceProgram = trace;
  node._traceVao = gl.createVertexArray();
  const traceLoc: Record<string, WebGLUniformLocation | null> = {};
  for (const name of TRACE_UNIFORMS) traceLoc[name] = gl.getUniformLocation(trace, name);
  node._traceLoc = traceLoc;
  node._compositeProgram = composite;
  node._compositeVao = gl.createVertexArray();
  const compositeLoc: Record<string, WebGLUniformLocation | null> = {};
  for (const name of COMPOSITE_UNIFORMS)
    compositeLoc[name] = gl.getUniformLocation(composite, name);
  node._compositeLoc = compositeLoc;
  return true;
};

const norm3 = (v: [number, number, number]): [number, number, number] => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross3 = (
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): [number, number, number] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/**
 * True if the camera moved enough to invalidate the accumulation. Eye and centre
 * are metres in render coordinates (5 cm threshold catches a real drag but not
 * the bit-identical repeats of our self-driven renders); up and fov are unit /
 * radians (tight threshold).
 */
const camMoved = (prev: Float64Array | null, next: Float64Array): boolean => {
  if (!prev) return true;
  for (let i = 0; i < 6; i++) if (Math.abs(prev[i] - next[i]) > 0.05) return true;
  for (let i = 6; i < 11; i++) if (Math.abs(prev[i] - next[i]) > 1e-5) return true;
  return false;
};

const glName = (t: { glName?: WebGLTexture } | null | undefined): WebGLTexture | null =>
  t?.glName ?? null;

function renderPathTrace(this: PathTraceNode, inputs: ManagedFBO[]): ManagedFBO | null | undefined {
  const input = inputs.find(({ name }) => name === this.produces);
  if (!input) return undefined;
  if (this.broken || this.centers.length < SPHERE_COUNT * 3) return this.bindRenderTarget();

  const gl = this.gl;
  if ((!this._traceProgram || !this._compositeProgram) && !compilePrograms(this, gl)) {
    this.broken = true;
    this.onBroken?.();
    return this.bindRenderTarget();
  }
  const traceLoc = this._traceLoc;
  const compositeLoc = this._compositeLoc;
  if (!this._traceProgram || !this._compositeProgram || !traceLoc || !compositeLoc) {
    return this.bindRenderTarget();
  }

  // FBO textures are opaque in the typings (FBOTexture is empty), but the
  // official RenderNode samples read `.glName` — narrow locally. Color is the
  // default attachment; depth comes from getTexture(DEPTH_STENCIL_ATTACHMENT).
  const fbo = input as unknown as {
    getTexture(attachment?: number): { glName?: WebGLTexture } | null | undefined;
  };
  const cityTex = glName(fbo.getTexture());
  const depthTex = glName(fbo.getTexture(gl.DEPTH_STENCIL_ATTACHMENT));
  if (!cityTex || !depthTex) return this.bindRenderTarget();

  // Camera basis in render coordinates, straight from the RenderCamera — no
  // matrix inversion, so float precision stays intact near the camera.
  const cam: RenderCamera = this.camera;
  const eye = cam.eye;
  const forward = norm3([cam.center[0] - eye[0], cam.center[1] - eye[1], cam.center[2] - eye[2]]);
  const right = norm3(cross3(forward, cam.up));
  const up = cross3(right, forward); // already unit (forward ⟂ right, both unit)

  // Eye-relative sphere centres: subtract the eye in float64, THEN drop to
  // float32 — the values are now small and exactly representable.
  const rel = new Float32Array(SPHERE_COUNT * 3);
  for (let i = 0; i < SPHERE_COUNT; i++) {
    rel[i * 3] = this.centers[i * 3] - eye[0];
    rel[i * 3 + 1] = this.centers[i * 3 + 1] - eye[1];
    rel[i * 3 + 2] = this.centers[i * 3 + 2] - eye[2];
  }

  const sun: SunLight = this.sunLight;
  const sunDir = norm3([-sun.direction[0], -sun.direction[1], -sun.direction[2]]);

  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;

  // Decide whether the accumulation is still valid. Any of: no history, a resize,
  // a bounce or single-mode change, or a real camera move restarts the estimate.
  const camSig = new Float64Array([
    eye[0],
    eye[1],
    eye[2],
    cam.center[0],
    cam.center[1],
    cam.center[2],
    cam.up[0],
    cam.up[1],
    cam.up[2],
    cam.fovX,
    cam.fovY,
  ]);
  const reset =
    !this._accum ||
    this._accW !== w ||
    this._accH !== h ||
    this._lastBounces !== this.bounces ||
    this._lastSingle !== this.single ||
    camMoved(this._camSig, camSig);
  if (reset) {
    this.sampleIndex = 1;
    this.releaseAccum();
  }
  this._camSig = camSig;
  this._accW = w;
  this._accH = h;
  this._lastBounces = this.bounces;
  this._lastSingle = this.single;

  const invSample = this.single ? 1.0 : 1.0 / this.sampleIndex;

  // --- Trace pass: cast one path per pixel, blend into the running average. ---
  // acquireOutputFramebuffer() hands back a fresh target; because the old accum
  // is still retained, the pool never returns the framebuffer we are sampling.
  const accumNew = this.acquireOutputFramebuffer();
  gl.useProgram(this._traceProgram);
  gl.bindVertexArray(this._traceVao ?? null);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);

  // On a reset frame there is no valid history; bind the city texture as a
  // harmless placeholder — uInvSample is 1.0, so the shader ignores it entirely.
  const prevTex = this._accum ? glName(this._accum.getTexture()) : null;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, prevTex ?? cityTex);
  gl.uniform1i(traceLoc.uAccumPrev, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, depthTex);
  gl.uniform1i(traceLoc.uDepth, 1);

  gl.uniform1f(traceLoc.uNear, cam.near);
  gl.uniform1f(traceLoc.uFar, cam.far);
  gl.uniform3f(traceLoc.uForward, forward[0], forward[1], forward[2]);
  gl.uniform3f(traceLoc.uRight, right[0], right[1], right[2]);
  gl.uniform3f(traceLoc.uUp, up[0], up[1], up[2]);
  gl.uniform1f(traceLoc.uTanX, Math.tan(cam.fovX / 2));
  gl.uniform1f(traceLoc.uTanY, Math.tan(cam.fovY / 2));
  gl.uniform3fv(traceLoc.uCenters, rel);
  gl.uniform1fv(traceLoc.uRadii, RADII);
  gl.uniform3fv(traceLoc.uAlbedo, ALBEDO);
  gl.uniform3fv(traceLoc.uEmission, EMISSION);
  gl.uniform3f(traceLoc.uSunDir, sunDir[0], sunDir[1], sunDir[2]);
  gl.uniform1f(traceLoc.uSkyDim, 0.4);
  gl.uniform1i(traceLoc.uBounces, this.bounces);
  gl.uniform2f(traceLoc.uResolution, w, h);
  gl.uniform1ui(traceLoc.uFrame, this.sampleIndex >>> 0);
  gl.uniform1f(traceLoc.uInvSample, invSample);

  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // Hold the new average across frames (SceneMotionBlur's bookkeeping): retain
  // the fresh accum, then release the one it replaces. At steady state exactly
  // one accum framebuffer is retained.
  const previousAccum = this._accum;
  accumNew.retain();
  this._accum = accumNew;
  this._accW = w;
  this._accH = h;
  if (previousAccum) previousAccum.release();

  // --- Composite pass: blend the average over the untouched city by the mask. ---
  const accumTex = glName(accumNew.getTexture());
  const output = this.acquireOutputFramebuffer();
  gl.useProgram(this._compositeProgram);
  gl.bindVertexArray(this._compositeVao ?? null);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, cityTex);
  gl.uniform1i(compositeLoc.uCity, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, accumTex ?? cityTex);
  gl.uniform1i(compositeLoc.uAccum, 1);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // The engine expects the returned output to carry the input's depth attachment.
  const depth = input.getAttachment(gl.DEPTH_STENCIL_ATTACHMENT);
  if (depth && "glName" in depth) output.attachDepth(depth);
  // Conservative but bulletproof: hand WebGL back in a known-good state.
  this.resetWebGLState();

  // Report progress (throttled) and self-drive the convergence: requesting a
  // render from inside render() is the SDK's supported continuous pattern. Stop
  // once we hit the cap so idle laptops aren't pinned tracing forever.
  const n = this.sampleIndex;
  if (n === 1 || n % 10 === 0 || n >= MAX_SAMPLES) this.onSample?.(n);
  if (n < MAX_SAMPLES) {
    this.sampleIndex = n + 1;
    this.requestRender();
  }
  return output;
}

const PathTraceRenderNode = RenderNode.createSubclass({
  declaredClass: "cge.PathTraceRenderNode",
  centers: [],
  bounces: 3,
  single: false,
  broken: false,
  onBroken: null,
  onSample: null,
  sampleIndex: 1,
  _accum: null,
  _accW: 0,
  _accH: 0,
  _camSig: null,
  _lastBounces: 3,
  _lastSingle: false,
  render: renderPathTrace,
  releaseAccum(this: PathTraceNode): void {
    if (this._accum) {
      this._accum.release();
      this._accum = null;
    }
  },
}) as unknown as new (props: {
  view: SceneView;
  consumes: ConsumedNodes;
  produces: RenderNodeOutput;
}) => PathTraceNode;

/** One pose south of and below the cluster, tilted up, framing spheres + skyline. */
const CAMERA = { position: [8.5417, 47.3705, 470] as const, heading: 6, tilt: 76 };

const INITIAL = { enabled: true, bounces: 3, single: false };

/**
 * Convert the five spheres' geographic positions to render coordinates in one
 * call. Returns a flat [x,y,z, ...] array, or null if the transform is
 * unavailable (e.g. the view was torn down mid-init).
 */
const computeCenters = (view: SceneView, groundZ: number): number[] | null => {
  const src: number[] = [];
  for (const s of SPHERES) {
    src.push(
      ANCHOR_LON + s.east / METERS_PER_DEG_LON,
      ANCHOR_LAT + s.north / METERS_PER_DEG_LAT,
      groundZ + ANCHOR_LIFT + s.up,
    );
  }
  const dest = new Array<number>(SPHERE_COUNT * 3);
  const out = webgl.toRenderCoordinates(
    view,
    src,
    0,
    SpatialReference.WGS84,
    dest,
    0,
    SPHERE_COUNT,
  );
  return out ? dest : null;
};

export default function ScenePathTrace(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const nodeRef = useRef<PathTraceNode | null>(null);
  const centersRef = useRef<number[] | null>(null);
  const [enabled, setEnabled] = useState(INITIAL.enabled);
  const [bounces, setBounces] = useState(INITIAL.bounces);
  const [single, setSingle] = useState(INITIAL.single);
  const [samples, setSamples] = useState(1);
  const [broken, setBroken] = useState(false);

  /** True once the view exists; all imperative access goes through this. */
  const readyScene = (): HTMLArcgisSceneElement | null => {
    const el = sceneRef.current;
    return el && el.view ? el : null;
  };

  const destroyNode = (): void => {
    const node = nodeRef.current;
    if (node && !node.destroyed) {
      node.releaseAccum();
      node.destroy();
    }
    nodeRef.current = null;
  };

  /** (Re)create the path-tracing node on the live view with current settings. */
  const createNode = (el: HTMLArcgisSceneElement, b: number, sg: boolean): void => {
    if (!centersRef.current) return; // centres not resolved yet
    destroyNode();
    const node = new PathTraceRenderNode({
      view: el.view as SceneView,
      consumes: { required: ["composite-color"] },
      produces: "composite-color",
    });
    node.centers = centersRef.current;
    node.bounces = b;
    node.single = sg;
    node.onBroken = () => setBroken(true);
    node.onSample = (n) => setSamples(n);
    nodeRef.current = node;
    node.requestRender();
  };

  /** Query ground elevation at the anchor, resolve render coords, build the node. */
  const initSpheres = async (el: HTMLArcgisSceneElement): Promise<void> => {
    const view = el.view as SceneView;
    let groundZ = FALLBACK_GROUND_Z;
    const ground = el.map?.ground;
    if (ground) {
      try {
        const q = await ground.queryElevation(
          new Point({ longitude: ANCHOR_LON, latitude: ANCHOR_LAT }),
        );
        groundZ = q.geometry.z ?? FALLBACK_GROUND_Z;
      } catch {
        // keep the fallback elevation
      }
    }
    if (!el.view) return; // torn down (StrictMode) while awaiting
    centersRef.current = computeCenters(view, groundZ);
    if (enabled) createNode(el, bounces, single);
  };

  const handleViewReady = (event: { target: HTMLArcgisSceneElement }): void => {
    const el = event.target;
    // StrictMode double-mounts re-fire this with a fresh view: the old node died
    // with the old view, so just resolve centres and create a new one.
    if (el.map && !el.map.findLayerById(OSM_BUILDINGS_ID)) {
      el.map.add(
        new SceneLayer({ id: OSM_BUILDINGS_ID, url: OSM_BUILDINGS_URL, title: "OSM 3D Buildings" }),
      );
    }
    void initSpheres(el).catch(() => undefined);
  };

  // Release the held accum FBO and destroy the node on unmount. In StrictMode the
  // node may already have died with its view; destroyNode guards on `destroyed`.
  useEffect(() => {
    return () => {
      destroyNode();
    };
  }, []);

  const caption = broken
    ? "The path-tracing shader failed to compile on this GPU — the scene renders untouched. That failure mode is honest too: custom pipeline injection is experimental, expert-level API."
    : !enabled
      ? "Path tracing off — this is the SceneView's pure rasterization of Zurich, spheres and light removed. Switch it on to trace real light paths through the sphere cluster over the Limmat."
      : single
        ? "This is what ONE random path per pixel actually looks like — the whole image is built from averaging millions of these guesses. Turn off single-sample to watch them converge."
        : `${samples} / ${MAX_SAMPLES} samples per pixel — each frame adds one random light path per pixel and the average converges toward the true image: watch the crimson and teal spheres bleed colour onto the white wall (that bleeding IS global illumination). Drag the map and everything resets to noise — exactly why interactive path tracers preview noisy.`;

  return (
    <PlaygroundFrame
      title="Progressive path tracing — Monte-Carlo global illumination over Zurich"
      caption={caption}
      onReset={() => {
        setEnabled(INITIAL.enabled);
        setBounces(INITIAL.bounces);
        setSingle(INITIAL.single);
        setSamples(1);
        setBroken(false);
        const el = readyScene();
        if (!el) return;
        createNode(el, INITIAL.bounces, INITIAL.single);
        void el
          .goTo(
            new Camera({
              position: {
                longitude: CAMERA.position[0],
                latitude: CAMERA.position[1],
                z: CAMERA.position[2],
              },
              heading: CAMERA.heading,
              tilt: CAMERA.tilt,
            }),
          )
          .catch(() => undefined);
      }}
      controls={
        <>
          <SwitchControl
            label="Path tracing"
            checked={enabled}
            onChange={(on) => {
              setEnabled(on);
              const el = readyScene();
              if (!el) return;
              if (on) createNode(el, bounces, single);
              else destroyNode();
            }}
          />
          <SliderControl
            label="Max bounces"
            value={bounces}
            min={1}
            max={4}
            step={1}
            onInput={(v) => {
              setBounces(v);
              const node = nodeRef.current;
              if (node && !node.destroyed) {
                node.bounces = v; // render() resets the accumulation on the change
                node.requestRender();
              }
            }}
          />
          <SwitchControl
            label="Show single sample"
            checked={single}
            onChange={(on) => {
              setSingle(on);
              const node = nodeRef.current;
              if (node && !node.destroyed) {
                node.single = on; // render() resets the accumulation on the change
                node.requestRender();
              }
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Path tracing is Monte-Carlo integration of the rendering equation: every pixel's colour
            is an integral over all the light paths reaching it, estimated by averaging many random
            paths. The noise you see is variance; convergence is that variance shrinking as the
            average accumulates. Global illumination — soft indirect light and the colour bleeding
            from the crimson and teal spheres onto the white wall — emerges for free, because a
            diffuse bounce simply tints the path's throughput by the surface's albedo. Only the five
            synthetic spheres take part in light transport; the city is rasterized and the emissive
            sphere is a stand-in light. The accumulation buffer is 8-bit, so deep noise shows faint
            banding. Uses the SceneView's experimental RenderNode API.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="osm"
        ground="world-elevation"
        cameraPosition="8.5417, 47.3705, 470"
        cameraHeading={CAMERA.heading}
        cameraTilt={CAMERA.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
    </PlaygroundFrame>
  );
}
