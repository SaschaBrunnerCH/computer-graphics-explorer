import { useRef, useState } from "react";
import SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import Point from "@arcgis/core/geometry/Point.js";
import SpatialReference from "@arcgis/core/geometry/SpatialReference.js";
import RenderNode from "@arcgis/core/views/3d/webgl/RenderNode.js";
import type SceneView from "@arcgis/core/views/SceneView.js";
import type ManagedFBO from "@arcgis/core/views/3d/webgl/ManagedFBO.js";
import type { RenderNodeOutput, ConsumedNodes } from "@arcgis/core/views/3d/webgl.js";
import * as webgl from "@arcgis/core/views/3d/webgl.js";
import "@arcgis/map-components/components/arcgis-scene";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * OUR sphere, OUR shaders, the ENGINE's sun. This uses the SceneView's
 * experimental public `RenderNode` API the same way the official "windmills"
 * sample does: the node consumes/produces `opaque-color`, binds that stage's
 * framebuffer (`bindRenderTarget()`), and draws WITH depth testing enabled so
 * the city's buildings occlude — and are occluded by — a sphere whose
 * triangles, GLSL and lighting math all live in this file. The one thing we
 * borrow from the engine is the light: `this.sunLight` is the scene's real sun,
 * so dragging the time-of-day slider sweeps the highlight on our sphere in the
 * same instant it sweeps the shadows across Zurich — one sun, two renderers.
 *
 * Precision: ECEF render coordinates near Zurich are ~4.3e6 m, far beyond
 * float32. So we author the sphere in a LOCAL frame (vertices are small offsets
 * in metres) and, per frame, pre-translate the view matrix by a float32-snapped
 * render-coordinate origin, doing the multiply in JS (float64). The GPU then
 * only ever sees small numbers. This is exactly the windmills sample's
 * local-origin technique; the difference is that a sphere is rotationally
 * symmetric, so we can align its local axes with the render axes and skip
 * building a tangent frame — the vertex normals are already in render
 * coordinates and line up directly with `sunLight.direction`.
 */

const OSM_BUILDINGS_URL =
  "https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer";
const OSM_BUILDINGS_ID = "osm-3d-buildings-material-lab";

/** Above the Limmat riverfront in Zurich; the sphere floats ~25 m up. */
const SPHERE_LON = 8.5417;
const SPHERE_LAT = 47.3717;
const SPHERE_LIFT = 25;
/** Used if the elevation query fails; the riverfront sits at ~405 m. */
const FALLBACK_GROUND_Z = 405;
const SPHERE_RADIUS = 8;
const SPHERE_SEGMENTS = 32;
const SPHERE_RINGS = 24;

/** Crimson (#dc2626) in linear-ish 0–1 — the fixed albedo of the sphere. */
const ALBEDO_GLSL = "vec3(0.8627, 0.1490, 0.1490)";

/** One preset framing the sphere against the riverfront skyline. */
const CAMERA = { position: "8.5417, 47.3702, 452", heading: 0, tilt: 72 };

type ShadingMode = "flat" | "gouraud" | "phong" | "ggx";

/** Local Zurich hour (UTC+2 in June) → Date for the sun position. */
const dateForHour = (hour: number): Date =>
  new Date(Date.UTC(2026, 5, 21, 0, Math.round(hour * 60) - 120));

const formatHour = (hour: number): string => {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

// --- Tiny 4x4 matrix helpers (column-major, WebGL convention), float64 in JS.
// Just enough to pre-translate the view matrix by the local origin without a
// matrix library. The multiply keeps the huge ECEF numbers cancelling in
// double precision, so the Float32Array we finally upload has a small (~metres)
// translation column and no jitter.

/** Column-major translation matrix for a 3-vector origin. */
const translationMat4 = (x: number, y: number, z: number): number[] => [
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  x,
  y,
  z,
  1,
];

/** Column-major 4x4 product a·b. */
const multiplyMat4 = (a: readonly number[], b: readonly number[]): number[] => {
  const out = new Array<number>(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
};

// --- Geometry: a UV sphere generated in JS. Positions are local metres
// (radius · direction); normals are the unit direction, which — because we keep
// the sphere axis-aligned with the render frame — is already a render-space
// normal. Interleaved [px, py, pz, nx, ny, nz] into one VBO + index buffer.

interface SphereMesh {
  vertices: Float32Array;
  indices: Uint16Array;
}

const buildSphere = (radius: number, segments: number, rings: number): SphereMesh => {
  const verts: number[] = [];
  for (let ring = 0; ring <= rings; ring++) {
    const phi = (ring / rings) * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    for (let seg = 0; seg <= segments; seg++) {
      const theta = (seg / segments) * 2 * Math.PI;
      const nx = sinPhi * Math.cos(theta);
      const ny = cosPhi;
      const nz = sinPhi * Math.sin(theta);
      verts.push(radius * nx, radius * ny, radius * nz, nx, ny, nz);
    }
  }
  const idx: number[] = [];
  const stride = segments + 1;
  for (let ring = 0; ring < rings; ring++) {
    for (let seg = 0; seg < segments; seg++) {
      const a = ring * stride + seg;
      const b = (ring + 1) * stride + seg;
      const c = ring * stride + seg + 1;
      const d = (ring + 1) * stride + seg + 1;
      // Wound CCW when seen from outside (front faces point outward).
      idx.push(a, c, b, b, c, d);
    }
  }
  return { vertices: new Float32Array(verts), indices: new Uint16Array(idx) };
};

// --- GLSL. Attribute locations are fixed (0 = position, 1 = normal) so one VAO
// feeds both programs. gl_Position = projection · viewOrigin · localPosition.

const SHARED_VERT = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
uniform mat4 uViewOrigin;
uniform mat4 uProjection;
out vec3 vNormal;
out vec3 vLocalPos;
void main() {
  vNormal = aNormal;
  vLocalPos = aPosition;
  gl_Position = uProjection * uViewOrigin * vec4(aPosition, 1.0);
}`;

/** Flat / Phong / PBR all live here, switched by uMode; lighting per fragment. */
const FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vLocalPos;
uniform int uMode;      // 0 flat, 1 phong, 2 ggx
uniform vec3 uEyeLocal; // camera eye in the sphere's local frame
uniform vec3 uLightDir; // incident sun direction (from sun toward scene)
uniform vec3 uDiffuse;  // sun diffuse colour * intensity
uniform vec3 uAmbient;  // sun ambient colour * intensity
uniform float uRoughness;
uniform float uMetallic;
out vec4 fragColor;

const vec3 ALBEDO = ${ALBEDO_GLSL};
const float PI = 3.14159265359;

float distributionGGX(float NdotH, float rough) {
  float a = rough * rough;
  float a2 = a * a;
  float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-7);
}
float geometrySchlick(float NdotX, float k) {
  return NdotX / (NdotX * (1.0 - k) + k);
}
vec3 fresnelSchlick(float cosT, vec3 F0) {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosT, 0.0, 1.0), 5.0);
}

void main() {
  vec3 N;
  if (uMode == 0) {
    // Honest flat shading: one face normal per triangle from screen-space
    // derivatives — no duplicated vertices. Orient it like the smooth normal.
    vec3 fn = normalize(cross(dFdx(vLocalPos), dFdy(vLocalPos)));
    if (dot(fn, normalize(vNormal)) < 0.0) fn = -fn;
    N = fn;
  } else {
    N = normalize(vNormal);
  }
  vec3 L = normalize(-uLightDir);
  vec3 V = normalize(uEyeLocal - vLocalPos);
  vec3 H = normalize(L + V);
  float NdotL = max(dot(N, L), 0.0);
  float NdotV = max(dot(N, V), 0.0);
  float NdotH = max(dot(N, H), 0.0);

  vec3 color;
  if (uMode == 2) {
    // Cook-Torrance: GGX NDF, Smith geometry, Schlick Fresnel — the BRDF.
    vec3 F0 = mix(vec3(0.04), ALBEDO, uMetallic);
    float D = distributionGGX(NdotH, uRoughness);
    float k = (uRoughness + 1.0);
    k = (k * k) / 8.0;
    float G = geometrySchlick(NdotV, k) * geometrySchlick(NdotL, k);
    vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);
    vec3 spec = (D * G * F) / max(4.0 * NdotV * NdotL, 1e-4);
    vec3 kd = (vec3(1.0) - F) * (1.0 - uMetallic);
    vec3 diffuse = kd * ALBEDO / PI;
    color = (diffuse + spec) * uDiffuse * NdotL + uAmbient * ALBEDO;
  } else {
    // Lambert, plus a Blinn-Phong specular for the "phong" mode.
    vec3 ambient = uAmbient * ALBEDO;
    vec3 diffuse = ALBEDO * uDiffuse * NdotL;
    vec3 spec = vec3(0.0);
    if (uMode == 1) {
      spec = uDiffuse * (pow(NdotH, 64.0) * (NdotL > 0.0 ? 0.6 : 0.0));
    }
    color = ambient + diffuse + spec;
  }
  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

/** Gouraud: the SAME Blinn-Phong as uMode==1, but evaluated per VERTEX and
 * interpolated — so the highlight starves between vertices. */
const GOURAUD_VERT = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
uniform mat4 uViewOrigin;
uniform mat4 uProjection;
uniform vec3 uEyeLocal;
uniform vec3 uLightDir;
uniform vec3 uDiffuse;
uniform vec3 uAmbient;
out vec3 vColor;
const vec3 ALBEDO = ${ALBEDO_GLSL};
void main() {
  vec3 N = normalize(aNormal);
  vec3 L = normalize(-uLightDir);
  vec3 V = normalize(uEyeLocal - aPosition);
  vec3 H = normalize(L + V);
  float NdotL = max(dot(N, L), 0.0);
  float NdotH = max(dot(N, H), 0.0);
  vec3 spec = uDiffuse * (pow(NdotH, 64.0) * (NdotL > 0.0 ? 0.6 : 0.0));
  vColor = uAmbient * ALBEDO + ALBEDO * uDiffuse * NdotL + spec;
  gl_Position = uProjection * uViewOrigin * vec4(aPosition, 1.0);
}`;

const GOURAUD_FRAG = `#version 300 es
precision highp float;
in vec3 vColor;
out vec4 fragColor;
void main() {
  fragColor = vec4(clamp(vColor, 0.0, 1.0), 1.0);
}`;

interface SharedUniforms {
  viewOrigin: WebGLUniformLocation | null;
  projection: WebGLUniformLocation | null;
  eyeLocal: WebGLUniformLocation | null;
  lightDir: WebGLUniformLocation | null;
  diffuse: WebGLUniformLocation | null;
  ambient: WebGLUniformLocation | null;
}

interface FragUniforms extends SharedUniforms {
  mode: WebGLUniformLocation | null;
  roughness: WebGLUniformLocation | null;
  metallic: WebGLUniformLocation | null;
}

interface MaterialNode extends RenderNode {
  /** Which shading model to draw; the segmented control writes this. */
  mode: ShadingMode;
  /** GGX-only uniforms (the sliders always apply, but only GGX reads them). */
  roughness: number;
  metallic: number;
  /** Float32-snapped render-coordinate origin of the sphere; null until ready. */
  origin: Float32Array | null;
  /** Set when a shader failed to compile — render then passes frames through. */
  broken: boolean;
  onBroken: (() => void) | null;
  _ready?: boolean;
  _frag?: WebGLProgram | null;
  _gouraud?: WebGLProgram | null;
  _vao?: WebGLVertexArrayObject | null;
  _indexCount?: number;
  _fragU?: FragUniforms;
  _gouraudU?: SharedUniforms;
}

const makeProgram = (
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string,
): WebGLProgram | null => {
  const compile = (type: number, src: string): WebGLShader | null => {
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
  const vs = compile(gl.VERTEX_SHADER, vertSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fragSrc);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  return program;
};

const sharedUniformsFor = (gl: WebGL2RenderingContext, program: WebGLProgram): SharedUniforms => ({
  viewOrigin: gl.getUniformLocation(program, "uViewOrigin"),
  projection: gl.getUniformLocation(program, "uProjection"),
  eyeLocal: gl.getUniformLocation(program, "uEyeLocal"),
  lightDir: gl.getUniformLocation(program, "uLightDir"),
  diffuse: gl.getUniformLocation(program, "uDiffuse"),
  ambient: gl.getUniformLocation(program, "uAmbient"),
});

/** Compile both programs and upload the sphere. Returns false on any failure. */
const initGL = (node: MaterialNode, gl: WebGL2RenderingContext): boolean => {
  const frag = makeProgram(gl, SHARED_VERT, FRAG);
  const gouraud = makeProgram(gl, GOURAUD_VERT, GOURAUD_FRAG);
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  const ibo = gl.createBuffer();
  if (!frag || !gouraud || !vao || !vbo || !ibo) return false;

  const mesh = buildSphere(SPHERE_RADIUS, SPHERE_SEGMENTS, SPHERE_RINGS);
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  node._frag = frag;
  node._gouraud = gouraud;
  node._vao = vao;
  node._indexCount = mesh.indices.length;
  node._fragU = {
    ...sharedUniformsFor(gl, frag),
    mode: gl.getUniformLocation(frag, "uMode"),
    roughness: gl.getUniformLocation(frag, "uRoughness"),
    metallic: gl.getUniformLocation(frag, "uMetallic"),
  };
  node._gouraudU = sharedUniformsFor(gl, gouraud);
  node._ready = true;
  return true;
};

/** Feed the per-frame light + camera uniforms shared by both programs. */
const setSharedUniforms = (
  node: MaterialNode,
  gl: WebGL2RenderingContext,
  u: SharedUniforms,
  viewOrigin: number[],
  projection: readonly number[],
): void => {
  const origin = node.origin;
  if (!origin) return;
  const eye = node.camera.eye;
  const sun = node.sunLight;
  const d = sun.diffuse;
  const a = sun.ambient;
  gl.uniformMatrix4fv(u.viewOrigin, false, new Float32Array(viewOrigin));
  gl.uniformMatrix4fv(u.projection, false, new Float32Array(projection as number[]));
  gl.uniform3f(u.eyeLocal, eye[0] - origin[0], eye[1] - origin[1], eye[2] - origin[2]);
  gl.uniform3f(u.lightDir, sun.direction[0], sun.direction[1], sun.direction[2]);
  gl.uniform3f(
    u.diffuse,
    d.color[0] * d.intensity,
    d.color[1] * d.intensity,
    d.color[2] * d.intensity,
  );
  gl.uniform3f(
    u.ambient,
    a.color[0] * a.intensity,
    a.color[1] * a.intensity,
    a.color[2] * a.intensity,
  );
};

function renderMaterial(this: MaterialNode, inputs: ManagedFBO[]): ManagedFBO | null | undefined {
  const input = inputs.find(({ name }) => name === this.produces);
  if (!input) return undefined;
  if (this.broken) return this.bindRenderTarget();
  // Placement runs async after the view is ready; until it lands, do nothing
  // but hand the untouched frame back.
  if (!this.origin) return this.bindRenderTarget();

  const gl = this.gl;
  if (!this._ready && !initGL(this, gl)) {
    this.broken = true;
    this.onBroken?.();
    return this.bindRenderTarget();
  }

  // Bind opaque-color (with its depth attachment) and draw into it, so the
  // city's depth occludes our sphere and vice versa.
  const fbo = this.bindRenderTarget();

  // Pre-translate the view matrix by the local origin in float64, then hand the
  // GPU only the resulting small-numbered matrix.
  const view = this.camera.viewMatrix;
  const projection = this.camera.projectionMatrix;
  const o = this.origin;
  const viewOrigin = multiplyMat4(view, translationMat4(o[0], o[1], o[2]));

  // bindRenderTarget() binds the stage FBO but does not reset the viewport —
  // an internal pass may have left it elsewhere. Set it from the camera.
  const vp = this.camera.viewport;
  gl.viewport(vp[0], vp[1], vp[2], vp[3]);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.disable(gl.BLEND);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.frontFace(gl.CCW);
  gl.bindVertexArray(this._vao ?? null);

  if (this.mode === "gouraud" && this._gouraud && this._gouraudU) {
    gl.useProgram(this._gouraud);
    setSharedUniforms(this, gl, this._gouraudU, viewOrigin, projection);
  } else if (this._frag && this._fragU) {
    gl.useProgram(this._frag);
    setSharedUniforms(this, gl, this._fragU, viewOrigin, projection);
    gl.uniform1i(this._fragU.mode, this.mode === "flat" ? 0 : this.mode === "phong" ? 1 : 2);
    gl.uniform1f(this._fragU.roughness, this.roughness);
    gl.uniform1f(this._fragU.metallic, this.metallic);
  }

  gl.drawElements(gl.TRIANGLES, this._indexCount ?? 0, gl.UNSIGNED_SHORT, 0);

  // Conservative but bulletproof: hand WebGL back in a known-good state.
  this.resetWebGLState();
  return fbo;
}

const MaterialRenderNode = RenderNode.createSubclass({
  declaredClass: "cge.MaterialRenderNode",
  mode: "phong",
  roughness: 0.35,
  metallic: 0,
  origin: null,
  broken: false,
  onBroken: null,
  render: renderMaterial,
}) as unknown as new (props: {
  view: SceneView;
  consumes: ConsumedNodes;
  produces: RenderNodeOutput;
}) => MaterialNode;

const MODES: { value: ShadingMode; label: string }[] = [
  { value: "flat", label: "Flat" },
  { value: "gouraud", label: "Gouraud" },
  { value: "phong", label: "Phong" },
  { value: "ggx", label: "PBR (GGX)" },
];

const INITIAL = {
  mode: "phong" as ShadingMode,
  roughness: 0.35,
  metallic: 0,
  hour: 16,
};

export default function SceneMaterialLab(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const nodeRef = useRef<MaterialNode | null>(null);
  const [mode, setMode] = useState<ShadingMode>(INITIAL.mode);
  const [roughness, setRoughness] = useState(INITIAL.roughness);
  const [metallic, setMetallic] = useState(INITIAL.metallic);
  const [hour, setHour] = useState(INITIAL.hour);
  const [broken, setBroken] = useState(false);

  /** True once the view exists; all imperative access goes through this. */
  const readyScene = (): HTMLArcgisSceneElement | null => {
    const el = sceneRef.current;
    return el && el.view ? el : null;
  };

  const applySun = (el: HTMLArcgisSceneElement, h: number): void => {
    const lighting = el.environment.lighting;
    if (lighting.type === "sun") lighting.date = dateForHour(h);
  };

  const rerender = (): void => {
    const node = nodeRef.current;
    if (node && !node.destroyed) node.requestRender();
  };

  /** Resolve the sphere's render-coordinate origin, then wake the node. */
  const placeSphere = async (el: HTMLArcgisSceneElement, node: MaterialNode): Promise<void> => {
    const view = el.view as SceneView;
    let groundZ = FALLBACK_GROUND_Z;
    const ground = el.map?.ground;
    if (ground) {
      try {
        const query = await ground.queryElevation(
          new Point({ longitude: SPHERE_LON, latitude: SPHERE_LAT }),
        );
        groundZ = query.geometry.z ?? FALLBACK_GROUND_Z;
      } catch {
        // keep the fallback elevation
      }
    }
    if (node.destroyed || !el.view) return;
    // A Float32Array destination gives us the float32-snapped origin the
    // local-origin technique requires.
    const dest = new Float32Array(3);
    const ok = webgl.toRenderCoordinates(
      view,
      [SPHERE_LON, SPHERE_LAT, groundZ + SPHERE_LIFT],
      0,
      SpatialReference.WGS84,
      dest,
      0,
      1,
    );
    if (ok) {
      node.origin = dest;
      node.requestRender();
    }
  };

  const destroyNode = (): void => {
    const node = nodeRef.current;
    if (node && !node.destroyed) node.destroy();
    nodeRef.current = null;
  };

  const createNode = (el: HTMLArcgisSceneElement): void => {
    destroyNode();
    const node = new MaterialRenderNode({
      view: el.view as SceneView,
      consumes: { required: ["composite-color"] },
      produces: "composite-color",
    });
    node.mode = mode;
    node.roughness = roughness;
    node.metallic = metallic;
    node.onBroken = () => setBroken(true);
    nodeRef.current = node;
    void placeSphere(el, node).catch(() => undefined);
  };

  const handleViewReady = (event: { target: HTMLArcgisSceneElement }): void => {
    const el = event.target;
    el.environment.lighting = {
      type: "sun",
      date: dateForHour(hour),
      directShadowsEnabled: true,
    };
    // StrictMode double-mounts re-fire this with a fresh view: the old node died
    // with the old view, so just create a new one; the layer add is guarded.
    if (el.map && !el.map.findLayerById(OSM_BUILDINGS_ID)) {
      el.map.add(
        new SceneLayer({ id: OSM_BUILDINGS_ID, url: OSM_BUILDINGS_URL, title: "OSM 3D Buildings" }),
      );
    }
    createNode(el);
  };

  const caption = broken
    ? "A shader failed to compile on this GPU — the scene renders untouched. That failure mode is honest too: custom pipeline injection is experimental, expert-level API."
    : mode === "flat"
      ? "Flat: one face normal per triangle, taken from screen-space derivatives (no duplicated vertices), lit by Lambert diffuse only. The facets are the geometry telling the truth about itself. This sphere is not an SDK graphic — its triangles, shaders and lighting math are this page's own GLSL, occluded by the real city and lit by the scene's actual sun."
      : mode === "gouraud"
        ? "Gouraud: Blinn-Phong evaluated at each of the sphere's vertices and interpolated across the triangles — watch the specular highlight go blocky and starve between vertices. Same lighting math as Phong, just computed in the wrong place."
        : mode === "phong"
          ? "Phong: the same Blinn-Phong math as Gouraud, moved from vertices to pixels — the highlight snaps into focus. Drag the sun (time-of-day) slider: one sun, two renderers — our GLSL picks up the scene's real sunlight every frame, so our highlight sweeps exactly as the city's shadows do."
          : `PBR (GGX): roughness ${roughness.toFixed(2)}, metallic ${metallic.toFixed(2)}. Cook-Torrance microfacet specular — GGX normal distribution, Smith geometry, Schlick Fresnel. This reflectance formula IS the BRDF. Drag the sun and watch the highlight sweep in lockstep with the city's shadows.`;

  return (
    <PlaygroundFrame
      title="Shading models on your own sphere — over Zurich"
      caption={caption}
      onReset={() => {
        setMode(INITIAL.mode);
        setRoughness(INITIAL.roughness);
        setMetallic(INITIAL.metallic);
        setHour(INITIAL.hour);
        setBroken(false);
        const el = readyScene();
        if (!el) return;
        applySun(el, INITIAL.hour);
        const node = nodeRef.current;
        if (node && !node.destroyed) {
          node.mode = INITIAL.mode;
          node.roughness = INITIAL.roughness;
          node.metallic = INITIAL.metallic;
          node.requestRender();
        }
      }}
      controls={
        <>
          <SegmentedControl<ShadingMode>
            label="Shading model"
            value={mode}
            options={MODES}
            onChange={(m) => {
              setMode(m);
              const node = nodeRef.current;
              if (node && !node.destroyed) {
                node.mode = m;
                node.requestRender();
              }
            }}
          />
          <SliderControl
            label="Roughness"
            value={roughness}
            min={0.05}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onInput={(v) => {
              setRoughness(v);
              const node = nodeRef.current;
              if (node && !node.destroyed) {
                node.roughness = v;
                node.requestRender();
              }
            }}
          />
          <SliderControl
            label="Metallic"
            value={metallic}
            min={0}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onInput={(v) => {
              setMetallic(v);
              const node = nodeRef.current;
              if (node && !node.destroyed) {
                node.metallic = v;
                node.requestRender();
              }
            }}
          />
          <SliderControl
            label="Sun time of day"
            value={hour}
            min={6}
            max={21}
            step={0.25}
            format={formatHour}
            onInput={(h) => {
              setHour(h);
              const el = readyScene();
              if (el) applySun(el, h);
              rerender();
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            A shading model is the formula that turns geometry (N·L, N·H) into colour; a BRDF is
            that formula's formal name — how much light leaves toward the eye for light arriving
            from a direction. Flat, Gouraud and Phong are the history of that idea; GGX
            (Cook-Torrance) is the present. Roughness and metallic only affect the GGX model. Uses
            the SceneView's experimental public RenderNode API to draw hand-written GLSL inside the
            engine's opaque pass.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="osm"
        ground="world-elevation"
        cameraPosition={CAMERA.position}
        cameraHeading={CAMERA.heading}
        cameraTilt={CAMERA.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
    </PlaygroundFrame>
  );
}
