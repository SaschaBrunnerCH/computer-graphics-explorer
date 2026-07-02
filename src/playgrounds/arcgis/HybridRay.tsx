import { useRef, useState } from "react";
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
 * Hybrid rendering — the architecture "ray tracing in games" actually ships.
 * A `RenderNode` consumes the engine's assembled frame (`composite-color`) and
 * its depth attachment, then runs a fullscreen pass that RAY-TRACES four
 * analytic spheres floating over the Limmat and composites them, depth-correct,
 * against the *rasterized* city behind. One image, two algorithms: primary
 * visibility of Zurich is ordinary triangle rasterization; the spheres'
 * reflections, shadows and shading are computed by firing real rays inside
 * this page's fragment shader.
 *
 * Rays are built WITHOUT a matrix inversion (precision-safe): the RenderCamera
 * hands us eye / center / up in render coordinates and the two field-of-view
 * angles. In JS we derive the camera basis (forward, right, up) and pass every
 * sphere centre as an EYE-RELATIVE vector (centre − eye) — the local-origin
 * trick that keeps float32 exact within tens of metres of the camera. In GLSL
 * the ray origin is simply vec3(0) (we ARE at the eye) and the direction is
 * forward + ndc.x·tan(fovX/2)·right + ndc.y·tan(fovY/2)·up.
 *
 * The honest seam: the city is rasterized, so escaped reflection rays can only
 * see a *synthetic* sky matched to the real sun direction — never the actual
 * buildings. Watch for it in the mirror. RenderNode is an experimental,
 * expert-level public API; the depth fetch/linearization follow Esri's own DoF
 * sample, and we call `resetWebGLState()` after drawing rather than saving.
 */

/** Zurich, over the Limmat by the Rathaus — the spheres float here. */
const ANCHOR_LON = 8.5417;
const ANCHOR_LAT = 47.3717;
/** Metres above local ground the sphere field is centred on. */
const ANCHOR_LIFT = 30;
/** Used if the elevation query fails; the river sits at ~405 m. */
const FALLBACK_GROUND_Z = 405;

/** OSM 3D buildings give the rasterized city real depth for the composite. */
const OSM_BUILDINGS_URL =
  "https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer";
const OSM_BUILDINGS_ID = "osm-3d-buildings-hybrid-ray";

const METERS_PER_DEG_LAT = 111320;
const METERS_PER_DEG_LON = METERS_PER_DEG_LAT * Math.cos((ANCHOR_LAT * Math.PI) / 180);

/**
 * The four spheres, as local (east, north, up) offsets in metres from the
 * anchor, plus radius, base colour and reflectivity. Base colour doubles as
 * the tint applied to a mirror bounce (white ⇒ untinted, gold ⇒ gold sheen).
 */
const SPHERES = [
  // Mirror: pure reflector, untinted — a chrome ball over the river.
  { east: -15, north: -18, up: 6, radius: 10, color: [0.95, 0.96, 0.98], reflect: 1.0 },
  // Crimson matte: Lambert only, no bounce.
  { east: 30, north: -12, up: -4, radius: 8, color: [0.72, 0.06, 0.1], reflect: 0.0 },
  // Gold glossy-ish: reflection tinted by its own colour.
  { east: -28, north: 22, up: 10, radius: 7, color: [1.0, 0.8, 0.36], reflect: 0.62 },
  // White matte: the plain reference sphere.
  { east: 18, north: 38, up: 2, radius: 6, color: [0.9, 0.9, 0.92], reflect: 0.0 },
] as const;

const SPHERE_COUNT = SPHERES.length;

const VERT = `#version 300 es
out vec2 vUv;
void main() {
  // One triangle covering the screen: (-1,-1) (3,-1) (-1,3).
  vec2 pos = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  vUv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

#define N 4

uniform sampler2D uColor;   // the rasterized city (composite-color)
uniform sampler2D uDepth;   // its depth attachment
uniform float uNear;
uniform float uFar;

uniform vec3 uForward;      // camera basis, render coords, per frame
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uTanX;        // tan(fovX / 2)
uniform float uTanY;        // tan(fovY / 2)

uniform vec3 uCenters[N];   // sphere centres, EYE-RELATIVE (centre - eye)
uniform float uRadii[N];
uniform vec3 uMatColor[N];
uniform float uReflect[N];

uniform vec3 uSunDir;       // L: toward the sun (= -SunLight.direction), unit
uniform vec3 uSunDiffuse;   // diffuse.color * diffuse.intensity
uniform vec3 uSunAmbient;   // ambient.color * ambient.intensity
uniform int uBounces;       // 0..3 mirror bounces
uniform int uShadows;       // 1 = fire shadow rays

in vec2 vUv;
out vec4 fragColor;

const float EPS = 1e-2;

// View-axis distance of the engine's rasterized scene, in metres, undoing the
// perspective depth non-linearity with the SceneView's own near/far (Esri's
// DoF-sample formula — the same depth buffer the z-fighting demo abuses).
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

// A synthetic sky matched to the real sun: a vertical gradient about the camera
// up axis plus a sun disk along L. Escaped reflection rays sample THIS, never
// the rasterized city — the honest limit of the hybrid.
vec3 skyColor(vec3 dir) {
  float h = clamp(dot(dir, uUp) * 0.5 + 0.5, 0.0, 1.0);
  vec3 sky = mix(vec3(0.78, 0.84, 0.93), vec3(0.19, 0.42, 0.79), h);
  float sun = smoothstep(0.9975, 0.9996, dot(dir, uSunDir));
  return sky + vec3(1.0, 0.94, 0.78) * sun * 3.0;
}

// Local Lambert + Blinn shading of one hit, with optional sphere-to-sphere
// shadow rays. The city can never shadow a sphere (it's rasterized, not in the
// ray set) — that's the seam.
vec3 shade(vec3 p, vec3 n, vec3 rd, int idx) {
  vec3 base = uMatColor[idx];
  float ndl = max(dot(n, uSunDir), 0.0);

  float shadow = 1.0;
  if (uShadows == 1 && ndl > 0.0) {
    float ts;
    int si;
    hitSpheres(p + n * EPS, uSunDir, ts, si);
    if (si >= 0) shadow = 0.0;
  }

  vec3 col = uSunAmbient * base;
  col += uSunDiffuse * base * ndl * shadow;

  vec3 h = normalize(uSunDir - rd); // half vector (view dir = -rd)
  float spec = pow(max(dot(n, h), 0.0), 48.0) * shadow * step(0.001, ndl);
  col += uSunDiffuse * spec * (0.25 + 0.75 * uReflect[idx]);
  return col;
}

void main() {
  vec3 sceneCol = texture(uColor, vUv).rgb;

  // Primary ray: origin is the eye (vec3(0)); direction from the camera basis.
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 rd = normalize(uForward + ndc.x * uTanX * uRight + ndc.y * uTanY * uUp);

  float t;
  int idx;
  hitSpheres(vec3(0.0), rd, t, idx);
  if (idx < 0) {
    fragColor = vec4(sceneCol, 1.0); // no sphere here: the city, untouched
    return;
  }

  // Depth composite: is the rasterized scene in front of this hit? Project the
  // hit onto the view axis to match the linearized scene distance.
  vec3 p = rd * t;
  if (sceneDist(vUv) < t * dot(rd, uForward)) {
    fragColor = vec4(sceneCol, 1.0); // a building occludes the sphere
    return;
  }

  // Shade the primary hit, then follow mirror bounces, accumulating the tinted
  // reflected radiance. Loop bound is constant (WebGL); we break at uBounces.
  vec3 col = vec3(0.0);
  vec3 tint = vec3(1.0);
  vec3 dir = rd;
  for (int b = 0; b <= 3; b++) {
    vec3 n = normalize(p - uCenters[idx]);
    vec3 local = shade(p, n, dir, idx);
    float refl = uReflect[idx];

    if (refl <= 0.0 || b >= uBounces) {
      col += tint * local; // matte, or out of bounces: show local shading
      break;
    }
    col += tint * local * (1.0 - refl); // the non-reflected fraction
    tint *= refl * uMatColor[idx];      // mirror = white tint, gold = gold tint

    dir = reflect(dir, n);
    vec3 ro = p + n * EPS;
    float t2;
    int idx2;
    hitSpheres(ro, dir, t2, idx2);
    if (idx2 < 0) {
      col += tint * skyColor(dir); // escaped the sphere set → synthetic sky
      break;
    }
    p = ro + dir * t2;
    idx = idx2;
  }

  fragColor = vec4(col, 1.0);
}`;

/**
 * The ray-tracing node. Sphere centres arrive in render coordinates (computed
 * once the view is ready); everything else — the camera basis, eye-relative
 * centres, sun — is recomputed each frame from `this.camera` and
 * `this.sunLight`, which change with every navigation or sun move.
 *
 * Built with `RenderNode.createSubclass` (the SDK's no-decorator path) because
 * Vite's react plugin can't parse the `@subclass` decorator form.
 */
interface HybridNode extends RenderNode {
  /** Sphere centres in render coordinates: [x0,y0,z0, x1,y1,z1, ...] (float64). */
  centers: number[];
  /** Mirror bounce count 0..3; the slider writes this then requestRender()s. */
  bounces: number;
  /** Whether to fire sphere-to-sphere shadow rays. */
  shadows: boolean;
  /** Set when shader compilation failed — render then passes frames through. */
  broken: boolean;
  /** Called once if compilation fails so the UI can say so honestly. */
  onBroken: (() => void) | null;
  _program?: WebGLProgram | null;
  _vao?: WebGLVertexArrayObject | null;
  _loc?: Record<string, WebGLUniformLocation | null>;
}

const UNIFORM_NAMES = [
  "uColor",
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
  "uMatColor",
  "uReflect",
  "uSunDir",
  "uSunDiffuse",
  "uSunAmbient",
  "uBounces",
  "uShadows",
] as const;

const compileProgram = (node: HybridNode, gl: WebGL2RenderingContext): boolean => {
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
  const vs = make(gl.VERTEX_SHADER, VERT);
  const fs = make(gl.FRAGMENT_SHADER, FRAG);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return false;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
  node._program = program;
  node._vao = gl.createVertexArray();
  const loc: Record<string, WebGLUniformLocation | null> = {};
  for (const name of UNIFORM_NAMES) loc[name] = gl.getUniformLocation(program, name);
  node._loc = loc;
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

function renderHybrid(this: HybridNode, inputs: ManagedFBO[]): ManagedFBO | null | undefined {
  const input = inputs.find(({ name }) => name === this.produces);
  if (!input) return undefined;
  if (this.broken || this.centers.length < SPHERE_COUNT * 3) return this.bindRenderTarget();

  const gl = this.gl;
  if (!this._program && !compileProgram(this, gl)) {
    this.broken = true;
    this.onBroken?.();
    return this.bindRenderTarget();
  }

  // FBO textures are opaque in the typings (FBOTexture is empty), but the
  // official RenderNode samples read `.glName` — narrow locally. Color is the
  // default attachment; depth comes from getTexture(DEPTH_STENCIL_ATTACHMENT),
  // exactly as Esri's DoF sample does.
  const fbo = input as unknown as {
    getTexture(attachment?: number): { glName?: WebGLTexture } | null | undefined;
  };
  const colorTex = fbo.getTexture();
  const depthTex = fbo.getTexture(gl.DEPTH_STENCIL_ATTACHMENT);
  const loc = this._loc;
  if (!colorTex?.glName || !depthTex?.glName || !this._program || !loc) {
    return this.bindRenderTarget();
  }

  // Camera basis in render coordinates, straight from the RenderCamera — no
  // matrix inversion, so float precision stays intact near the camera.
  const cam: RenderCamera = this.camera;
  const eye = cam.eye;
  const forward = norm3([cam.center[0] - eye[0], cam.center[1] - eye[1], cam.center[2] - eye[2]]);
  const right = norm3(cross3(forward, cam.up));
  const up = cross3(right, forward); // already unit (forward ⟂ right, both unit)

  // Eye-relative sphere centres: subtract the eye in float64, THEN drop to
  // float32 — the values are now small (tens of metres) and exactly representable.
  const rel = new Float32Array(SPHERE_COUNT * 3);
  for (let i = 0; i < SPHERE_COUNT; i++) {
    rel[i * 3] = this.centers[i * 3] - eye[0];
    rel[i * 3 + 1] = this.centers[i * 3 + 1] - eye[1];
    rel[i * 3 + 2] = this.centers[i * 3 + 2] - eye[2];
  }

  const sun: SunLight = this.sunLight;
  const sunDir = norm3([-sun.direction[0], -sun.direction[1], -sun.direction[2]]);
  const dc = sun.diffuse.color;
  const di = sun.diffuse.intensity;
  const ac = sun.ambient.color;
  const ai = sun.ambient.intensity;

  const radii = new Float32Array(SPHERES.map((s) => s.radius));
  const matColor = new Float32Array(SPHERES.flatMap((s) => [...s.color]));
  const reflect = new Float32Array(SPHERES.map((s) => s.reflect));

  const output = this.acquireOutputFramebuffer();
  gl.useProgram(this._program);
  gl.bindVertexArray(this._vao ?? null);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, colorTex.glName);
  gl.uniform1i(loc.uColor, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, depthTex.glName);
  gl.uniform1i(loc.uDepth, 1);

  gl.uniform1f(loc.uNear, cam.near);
  gl.uniform1f(loc.uFar, cam.far);
  gl.uniform3f(loc.uForward, forward[0], forward[1], forward[2]);
  gl.uniform3f(loc.uRight, right[0], right[1], right[2]);
  gl.uniform3f(loc.uUp, up[0], up[1], up[2]);
  gl.uniform1f(loc.uTanX, Math.tan(cam.fovX / 2));
  gl.uniform1f(loc.uTanY, Math.tan(cam.fovY / 2));

  gl.uniform3fv(loc.uCenters, rel);
  gl.uniform1fv(loc.uRadii, radii);
  gl.uniform3fv(loc.uMatColor, matColor);
  gl.uniform1fv(loc.uReflect, reflect);

  gl.uniform3f(loc.uSunDir, sunDir[0], sunDir[1], sunDir[2]);
  gl.uniform3f(loc.uSunDiffuse, dc[0] * di, dc[1] * di, dc[2] * di);
  gl.uniform3f(loc.uSunAmbient, ac[0] * ai, ac[1] * ai, ac[2] * ai);
  gl.uniform1i(loc.uBounces, this.bounces);
  gl.uniform1i(loc.uShadows, this.shadows ? 1 : 0);

  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // Reuse the input's depth so the engine's attachments still match. We return
  // color only and DON'T write gl_FragDepth (correct engine depth encoding
  // isn't cheaply available) — so the spheres won't occlude later transparent
  // scene content. Acceptable for this teaching demo.
  const depth = input.getAttachment(gl.DEPTH_STENCIL_ATTACHMENT);
  if (depth && "glName" in depth) output.attachDepth(depth);
  // Conservative but bulletproof: hand WebGL back in a known-good state.
  this.resetWebGLState();
  return output;
}

const HybridRenderNode = RenderNode.createSubclass({
  declaredClass: "cge.HybridRenderNode",
  centers: [],
  bounces: 2,
  shadows: true,
  broken: false,
  onBroken: null,
  render: renderHybrid,
}) as unknown as new (props: {
  view: SceneView;
  consumes: ConsumedNodes;
  produces: RenderNodeOutput;
}) => HybridNode;

/** One pose ~100 m back and south, tilted up, framing the spheres and skyline. */
const CAMERA = { position: [8.5417, 47.3707, 468] as const, heading: 6, tilt: 78 };

const INITIAL = { enabled: true, bounces: 2, shadows: true };

/**
 * Convert the four spheres' geographic positions to render coordinates in one
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

export default function HybridRay(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const nodeRef = useRef<HybridNode | null>(null);
  const centersRef = useRef<number[] | null>(null);
  const [enabled, setEnabled] = useState(INITIAL.enabled);
  const [bounces, setBounces] = useState(INITIAL.bounces);
  const [shadows, setShadows] = useState(INITIAL.shadows);
  const [broken, setBroken] = useState(false);

  /** True once the view exists; all imperative access goes through this. */
  const readyScene = (): HTMLArcgisSceneElement | null => {
    const el = sceneRef.current;
    return el && el.view ? el : null;
  };

  const destroyNode = (): void => {
    const node = nodeRef.current;
    if (node && !node.destroyed) node.destroy();
    nodeRef.current = null;
  };

  /** (Re)create the ray-tracing node on the live view with current settings. */
  const createNode = (el: HTMLArcgisSceneElement, b: number, sh: boolean): void => {
    if (!centersRef.current) return; // centres not resolved yet
    destroyNode();
    const node = new HybridRenderNode({
      view: el.view as SceneView,
      consumes: { required: ["composite-color"] },
      produces: "composite-color",
    });
    node.centers = centersRef.current;
    node.bounces = b;
    node.shadows = sh;
    node.onBroken = () => setBroken(true);
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
    if (enabled) createNode(el, bounces, shadows);
  };

  const handleViewReady = (event: { target: HTMLArcgisSceneElement }): void => {
    const el = event.target;
    // StrictMode double-mounts re-fire this with a fresh view: the old node
    // died with the old view, so just resolve centres and create a new one.
    if (el.map && !el.map.findLayerById(OSM_BUILDINGS_ID)) {
      el.map.add(
        new SceneLayer({ id: OSM_BUILDINGS_ID, url: OSM_BUILDINGS_URL, title: "OSM 3D Buildings" }),
      );
    }
    void initSpheres(el).catch(() => undefined);
  };

  const caption = broken
    ? "The ray-tracing shader failed to compile on this GPU — the scene renders untouched. That failure mode is honest too: custom pipeline injection is experimental, expert-level API."
    : enabled
      ? `${bounces} ${bounces === 1 ? "bounce" : "bounces"}, shadow rays ${shadows ? "on" : "off"}: the spheres' reflections${shadows ? " and shadows" : ""} are computed by firing actual rays inside this page's fragment shader; the city behind them is the engine's ordinary rasterization. One image, two algorithms — exactly how “ray tracing in games” ships. Find the seam: buildings never appear in the mirror, only sky and the other spheres.`
      : "Ray tracing off — this is the SceneView's pure rasterization of Zurich, spheres and all removed. Switch it on to trace four analytic spheres over the Limmat and composite them, depth-correct, against the rasterized city.";

  return (
    <PlaygroundFrame
      title="Hybrid rendering — ray-traced spheres over rasterized Zurich"
      caption={caption}
      onReset={() => {
        setEnabled(INITIAL.enabled);
        setBounces(INITIAL.bounces);
        setShadows(INITIAL.shadows);
        setBroken(false);
        const el = readyScene();
        if (!el) return;
        createNode(el, INITIAL.bounces, INITIAL.shadows);
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
            label="Ray tracing"
            checked={enabled}
            onChange={(on) => {
              setEnabled(on);
              const el = readyScene();
              if (!el) return;
              if (on) createNode(el, bounces, shadows);
              else destroyNode();
            }}
          />
          <SliderControl
            label="Mirror bounces"
            value={bounces}
            min={0}
            max={3}
            step={1}
            onInput={(v) => {
              setBounces(v);
              const node = nodeRef.current;
              if (node && !node.destroyed) {
                node.bounces = v;
                node.requestRender();
              }
            }}
          />
          <SwitchControl
            label="Shadow rays"
            checked={shadows}
            onChange={(on) => {
              setShadows(on);
              const node = nodeRef.current;
              if (node && !node.destroyed) {
                node.shadows = on;
                node.requestRender();
              }
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Ray tracing intersects light paths with geometry analytically (here, four spheres solved
            by the quadratic formula in the fragment shader); rasterization projects triangles to
            the screen (here, the whole of Zurich). A hybrid renderer rasterizes primary visibility,
            then traces only what rasterization can't do — true reflections and sphere-to-sphere
            shadows — and composites the two by depth. Because the city is rasterized, escaped
            reflection rays can only see a synthetic sky matched to the real sun, never the actual
            buildings: that's the honest limit of this architecture. Uses the SceneView's
            experimental RenderNode API.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="osm"
        ground="world-elevation"
        cameraPosition="8.5417, 47.3707, 468"
        cameraHeading={CAMERA.heading}
        cameraTilt={CAMERA.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
    </PlaygroundFrame>
  );
}
