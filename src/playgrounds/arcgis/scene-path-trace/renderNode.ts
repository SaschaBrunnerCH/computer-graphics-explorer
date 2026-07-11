import type SceneView from "@arcgis/core/views/SceneView.js";
import RenderNode from "@arcgis/core/views/3d/webgl/RenderNode.js";
import type ManagedColorAttachment from "@arcgis/core/views/3d/webgl/ManagedColorAttachment.js";
import type ManagedFBO from "@arcgis/core/views/3d/webgl/ManagedFBO.js";
import type ManagedDepthAttachment from "@arcgis/core/views/3d/webgl/ManagedDepthAttachment.js";
import type RenderCamera from "@arcgis/core/views/3d/webgl/RenderCamera.js";
import type { SunLight } from "@arcgis/core/views/3d/webgl/types.js";
import type { ConsumedNodes, RenderNodeOutput } from "@arcgis/core/views/3d/webgl.js";
import {
  MAX_PLANES_PER_SOLID,
  MAX_SOLID_COUNT,
  TRACE_LIMITS,
  type PackedAnalyticScene,
} from "./scene";

type Vec3 = [number, number, number];

const VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 position = vec2(
    gl_VertexID == 1 ? 3.0 : -1.0,
    gl_VertexID == 2 ? 3.0 : -1.0
  );
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

/**
 * One exact convex intersection replaces SDF marching. Every solid owns at
 * most eight half-spaces; a point is inside when dot(normal, point) <= limit.
 * Direct sunlight is sampled explicitly at every diffuse hit, while the
 * requested 0..3 stochastic bounces carry indirect colour between buildings.
 */
const TRACE_FRAG = `#version 300 es
precision highp float;
precision highp int;

#define MAX_SOLIDS ${MAX_SOLID_COUNT}
#define MAX_PLANES ${MAX_PLANES_PER_SOLID}
#define MAX_MATERIALS 4
#define MAX_INDIRECT_BOUNCES ${TRACE_LIMITS.maxIndirectBounces}

uniform sampler2D uAccumPrevious;
uniform sampler2D uDepth;
uniform float uNear;
uniform float uFar;

uniform vec3 uEye;
uniform vec3 uForward;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uTanX;
uniform float uTanY;

uniform int uSolidCount;
uniform vec4 uPlaneEquations[MAX_SOLIDS * MAX_PLANES];
uniform int uPlaneCounts[MAX_SOLIDS];
uniform int uMaterialIndices[MAX_SOLIDS];
uniform vec3 uMaterialAlbedos[MAX_MATERIALS];

uniform vec3 uSunDirection;
uniform vec3 uSunDiffuse;
uniform vec3 uSunAmbient;
uniform int uIndirectBounces;
uniform vec2 uResolution;
uniform uint uFrame;
uniform float uInverseSample;

in vec2 vUv;
out vec4 fragColor;

const float EPSILON = 0.025;
const float FAR_DISTANCE = 1e20;
const float PI = 3.141592653589793;

uint pcg(inout uint state) {
  state = state * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

float randomFloat(inout uint state) {
  return float(pcg(state)) * (1.0 / 4294967296.0);
}

float rasterizedSceneDistance(vec2 uv) {
  float depth = texture(uDepth, uv).r;
  float ndc = depth * 2.0 - 1.0;
  return abs((2.0 * uNear * uFar) /
    (ndc * (uFar - uNear) - (uFar + uNear)));
}

bool intersectSolid(
  int solidIndex,
  vec3 rayOrigin,
  vec3 rayDirection,
  out float hitDistance,
  out vec3 hitNormal
) {
  float enterDistance = -FAR_DISTANCE;
  float exitDistance = FAR_DISTANCE;
  vec3 enterNormal = vec3(0.0);
  vec3 exitNormal = vec3(0.0);
  int planeCount = uPlaneCounts[solidIndex];

  for (int planeIndex = 0; planeIndex < MAX_PLANES; planeIndex++) {
    if (planeIndex >= planeCount) break;
    vec4 plane = uPlaneEquations[solidIndex * MAX_PLANES + planeIndex];
    float remaining = plane.w - dot(plane.xyz, rayOrigin);
    float denominator = dot(plane.xyz, rayDirection);

    if (abs(denominator) < 1e-6) {
      if (remaining < 0.0) return false;
      continue;
    }

    float distance = remaining / denominator;
    if (denominator < 0.0) {
      if (distance > enterDistance) {
        enterDistance = distance;
        enterNormal = plane.xyz;
      }
    } else if (distance < exitDistance) {
      exitDistance = distance;
      exitNormal = plane.xyz;
    }
    if (enterDistance > exitDistance) return false;
  }

  if (enterDistance > EPSILON) {
    hitDistance = enterDistance;
    hitNormal = enterNormal;
    return true;
  }
  if (exitDistance > EPSILON) {
    hitDistance = exitDistance;
    hitNormal = exitNormal;
    return true;
  }
  return false;
}

bool intersectScene(
  vec3 rayOrigin,
  vec3 rayDirection,
  out float nearestDistance,
  out int materialIndex,
  out vec3 nearestNormal
) {
  nearestDistance = FAR_DISTANCE;
  materialIndex = -1;
  nearestNormal = vec3(0.0);
  for (int solidIndex = 0; solidIndex < MAX_SOLIDS; solidIndex++) {
    if (solidIndex >= uSolidCount) break;
    float distance;
    vec3 normal;
    if (intersectSolid(solidIndex, rayOrigin, rayDirection, distance, normal) &&
        distance < nearestDistance) {
      nearestDistance = distance;
      materialIndex = uMaterialIndices[solidIndex];
      nearestNormal = normal;
    }
  }
  if (materialIndex < 0) return false;
  nearestNormal = normalize(nearestNormal);
  if (dot(nearestNormal, rayDirection) > 0.0) nearestNormal = -nearestNormal;
  return true;
}

bool sunIsOccluded(vec3 rayOrigin) {
  float distance;
  int materialIndex;
  vec3 normal;
  return intersectScene(rayOrigin, uSunDirection, distance, materialIndex, normal);
}

vec3 cosineWeightedHemisphere(vec3 normal, inout uint state) {
  float u1 = randomFloat(state);
  float u2 = randomFloat(state);
  float radius = sqrt(u1);
  float phi = 2.0 * PI * u2;
  vec3 helper = abs(normal.z) < 0.999
    ? vec3(0.0, 0.0, 1.0)
    : vec3(1.0, 0.0, 0.0);
  vec3 tangent = normalize(cross(helper, normal));
  vec3 bitangent = cross(normal, tangent);
  return normalize(
    tangent * (radius * cos(phi)) +
    bitangent * (radius * sin(phi)) +
    normal * sqrt(max(0.0, 1.0 - u1))
  );
}

vec3 ambientSky(vec3 direction) {
  float height = clamp(direction.z * 0.5 + 0.5, 0.0, 1.0);
  return uSunAmbient * mix(0.55, 1.15, height);
}

void main() {
  vec4 previous = texture(uAccumPrevious, vUv);
  uint state = uint(gl_FragCoord.x) * 1973u +
    uint(gl_FragCoord.y) * 9277u + uFrame * 26699u + 1u;
  pcg(state);

  vec2 jitter = (vec2(randomFloat(state), randomFloat(state)) - 0.5) / uResolution;
  vec2 ndc = (vUv + jitter) * 2.0 - 1.0;
  vec3 primaryDirection = normalize(
    uForward + ndc.x * uTanX * uRight + ndc.y * uTanY * uUp
  );

  float distance;
  int materialIndex;
  vec3 normal;
  if (!intersectScene(uEye, primaryDirection, distance, materialIndex, normal) ||
      rasterizedSceneDistance(vUv) < distance * dot(primaryDirection, uForward)) {
    fragColor = mix(previous, vec4(0.0), uInverseSample);
    return;
  }

  vec3 hitPoint = uEye + primaryDirection * distance;
  vec3 throughput = vec3(1.0);
  vec3 radiance = vec3(0.0);

  for (int bounce = 0; bounce <= MAX_INDIRECT_BOUNCES; bounce++) {
    vec3 albedo = uMaterialAlbedos[materialIndex];
    float cosineToSun = max(dot(normal, uSunDirection), 0.0);
    if (cosineToSun > 0.0 &&
        !sunIsOccluded(hitPoint + normal * EPSILON)) {
      // uSunDiffuse is directional irradiance, so Lambert's cosine is enough;
      // the 1/pi term is already folded into the engine's compositing scale.
      radiance += throughput * albedo * uSunDiffuse * cosineToSun;
    }

    if (bounce >= uIndirectBounces) break;
    throughput *= albedo;
    vec3 nextDirection = cosineWeightedHemisphere(normal, state);
    vec3 nextOrigin = hitPoint + normal * EPSILON;
    if (!intersectScene(nextOrigin, nextDirection, distance, materialIndex, normal)) {
      radiance += throughput * ambientSky(nextDirection);
      break;
    }
    hitPoint = nextOrigin + nextDirection * distance;
  }

  vec3 sampleColor = clamp(radiance, 0.0, 1.0);
  fragColor = mix(previous, vec4(sampleColor, 1.0), uInverseSample);
}`;

const COMPOSITE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uRasterizedScene;
uniform sampler2D uAccumulation;
in vec2 vUv;
out vec4 fragColor;

vec3 linearToSrgb(vec3 linearColor) {
  vec3 low = linearColor * 12.92;
  vec3 high = 1.055 * pow(max(linearColor, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), linearColor));
}

void main() {
  vec3 rasterized = texture(uRasterizedScene, vUv).rgb;
  vec4 traced = texture(uAccumulation, vUv);
  // The history is averaged in linear light and RGB includes zero-valued miss
  // samples. Recover the covered-pixel mean before display encoding so
  // antialiased silhouettes are weighted once, not darkened twice.
  vec3 coveredLinear = traced.rgb / max(traced.a, 1e-5);
  vec3 tracedDisplay = linearToSrgb(clamp(coveredLinear, 0.0, 1.0));
  fragColor = vec4(
    rasterized * (1.0 - traced.a) + tracedDisplay * traced.a,
    1.0
  );
}`;

export interface PathTraceNode extends RenderNode {
  scene: PackedAnalyticScene | null;
  /** Column-major affine matrix mapping ArcGIS render coordinates into ENU metres. */
  renderToLocal: Float64Array | null;
  indirectBounces: number;
  singleSample: boolean;
  broken: boolean;
  onBroken: (() => void) | null;
  onSample: ((sample: number) => void) | null;
  onSunBelowHorizon: ((sunBelowHorizon: boolean) => void) | null;
  sampleIndex: number;
  _accumulation: ManagedFBO | null;
  _accumulationWidth: number;
  _accumulationHeight: number;
  _cameraSignature: Float64Array | null;
  _sunSignature: Float64Array | null;
  _lastIndirectBounces: number;
  _lastSingleSample: boolean;
  _lastScene: PackedAnalyticScene | null;
  _lastSunBelowHorizon: boolean | null;
  _forceReset: boolean;
  _gl?: WebGL2RenderingContext | null;
  _traceProgram?: WebGLProgram | null;
  _traceVao?: WebGLVertexArrayObject | null;
  _traceLocations?: Record<string, WebGLUniformLocation | null>;
  _compositeProgram?: WebGLProgram | null;
  _compositeVao?: WebGLVertexArrayObject | null;
  _compositeLocations?: Record<string, WebGLUniformLocation | null>;
  releaseAccumulation: () => void;
  resetAccumulation: () => void;
}

const TRACE_UNIFORMS = [
  "uAccumPrevious",
  "uDepth",
  "uNear",
  "uFar",
  "uEye",
  "uForward",
  "uRight",
  "uUp",
  "uTanX",
  "uTanY",
  "uSolidCount",
  "uPlaneEquations",
  "uPlaneCounts",
  "uMaterialIndices",
  "uMaterialAlbedos",
  "uSunDirection",
  "uSunDiffuse",
  "uSunAmbient",
  "uIndirectBounces",
  "uResolution",
  "uFrame",
  "uInverseSample",
] as const;

const COMPOSITE_UNIFORMS = ["uRasterizedScene", "uAccumulation"] as const;

const makeProgram = (
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram | null => {
  const compile = (type: number, source: string): WebGLShader | null => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const vertexShader = compile(gl.VERTEX_SHADER, vertexSource);
  if (!vertexShader) return null;
  const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!fragmentShader) {
    gl.deleteShader(vertexShader);
    return null;
  }
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return null;
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
};

const compilePrograms = (node: PathTraceNode, gl: WebGL2RenderingContext): boolean => {
  const traceProgram = makeProgram(gl, VERT, TRACE_FRAG);
  const compositeProgram = makeProgram(gl, VERT, COMPOSITE_FRAG);
  if (!traceProgram || !compositeProgram) {
    if (traceProgram) gl.deleteProgram(traceProgram);
    if (compositeProgram) gl.deleteProgram(compositeProgram);
    return false;
  }

  node._gl = gl;
  node._traceProgram = traceProgram;
  node._traceVao = gl.createVertexArray();
  node._traceLocations = Object.fromEntries(
    TRACE_UNIFORMS.map((name) => [name, gl.getUniformLocation(traceProgram, name)]),
  );
  node._compositeProgram = compositeProgram;
  node._compositeVao = gl.createVertexArray();
  node._compositeLocations = Object.fromEntries(
    COMPOSITE_UNIFORMS.map((name) => [name, gl.getUniformLocation(compositeProgram, name)]),
  );
  return true;
};

const normalize = (value: Vec3): Vec3 => {
  const length = Math.hypot(value[0], value[1], value[2]) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
};

const cross = (a: readonly number[], b: readonly number[]): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const transformPoint = (matrix: Float64Array, point: readonly number[]): Vec3 => [
  matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12],
  matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13],
  matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14],
];

const transformDirection = (matrix: Float64Array, direction: readonly number[]): Vec3 => [
  matrix[0] * direction[0] + matrix[4] * direction[1] + matrix[8] * direction[2],
  matrix[1] * direction[0] + matrix[5] * direction[1] + matrix[9] * direction[2],
  matrix[2] * direction[0] + matrix[6] * direction[1] + matrix[10] * direction[2],
];

const signatureChanged = (
  previous: Float64Array | null,
  next: Float64Array,
  positionComponents: number,
): boolean => {
  if (!previous || previous.length !== next.length) return true;
  for (let index = 0; index < next.length; index++) {
    const tolerance = index < positionComponents ? 0.05 : 1e-5;
    if (Math.abs(previous[index] - next[index]) > tolerance) return true;
  }
  return false;
};

interface RenderTexture {
  readonly glName?: WebGLTexture;
  readonly descriptor?: { readonly width?: number; readonly height?: number };
}

const textureName = (texture: RenderTexture | null | undefined): WebGLTexture | null =>
  texture?.glName ?? null;

const establishFullscreenState = (
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): void => {
  gl.viewport(0, 0, width, height);
  gl.colorMask(true, true, true, true);
  gl.depthMask(false);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.STENCIL_TEST);
};

const composite = (
  node: PathTraceNode,
  input: ManagedFBO,
  rasterizedTexture: WebGLTexture,
  accumulationTexture: WebGLTexture,
): ManagedFBO => {
  const gl = node.gl;
  const output = node.acquireOutputFramebuffer();
  establishFullscreenState(gl, node._accumulationWidth, node._accumulationHeight);
  const locations = node._compositeLocations;
  if (!node._compositeProgram || !locations) return output;

  gl.useProgram(node._compositeProgram);
  gl.bindVertexArray(node._compositeVao ?? null);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, rasterizedTexture);
  gl.uniform1i(locations.uRasterizedScene, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, accumulationTexture);
  gl.uniform1i(locations.uAccumulation, 1);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  const depth = input.getAttachment(gl.DEPTH_STENCIL_ATTACHMENT) as ManagedDepthAttachment | null;
  if (depth) output.attachDepth(depth);
  const emissive = input.getAttachment(gl.COLOR_ATTACHMENT1) as ManagedColorAttachment | null;
  if (emissive) output.attachColor(emissive, gl.COLOR_ATTACHMENT1);
  return output;
};

function renderPathTrace(this: PathTraceNode, inputs: ManagedFBO[]): ManagedFBO | null | undefined {
  const input = inputs.find(({ name }) => name === this.produces);
  const packedScene = this.scene;
  const renderToLocal = this.renderToLocal;
  if (!input) return undefined;
  if (this.broken || !packedScene || !renderToLocal) return this.bindRenderTarget();

  const gl = this.gl;
  if ((!this._traceProgram || !this._compositeProgram) && !compilePrograms(this, gl)) {
    this.broken = true;
    this.onBroken?.();
    return this.bindRenderTarget();
  }
  const traceLocations = this._traceLocations;
  if (!this._traceProgram || !traceLocations) return this.bindRenderTarget();

  const source = input as unknown as {
    getTexture(attachment?: number): RenderTexture | null | undefined;
  };
  const rasterizedDescriptor = source.getTexture();
  const rasterizedTexture = textureName(rasterizedDescriptor);
  const depthTexture = textureName(source.getTexture(gl.DEPTH_STENCIL_ATTACHMENT));
  if (!rasterizedTexture || !depthTexture) return this.bindRenderTarget();

  try {
    const camera: RenderCamera = this.camera;
    const renderEye = camera.eye;
    const renderForward = normalize([
      camera.center[0] - renderEye[0],
      camera.center[1] - renderEye[1],
      camera.center[2] - renderEye[2],
    ]);
    const renderRight = normalize(cross(renderForward, camera.up));
    const renderUp = normalize(cross(renderRight, renderForward));
    const localEye = transformPoint(renderToLocal, renderEye);
    const localForward = normalize(transformDirection(renderToLocal, renderForward));
    const localRight = normalize(transformDirection(renderToLocal, renderRight));
    const localUp = normalize(transformDirection(renderToLocal, renderUp));

    const sun: SunLight = this.sunLight;
    // Despite the legacy `incident` wording in the public type, SDK 5.0.19
    // exposes the surface-to-light vector here. Its positive local Z matches
    // the astronomical sun altitude; negating it sends shadow rays underground.
    const directionToSun = normalize(transformDirection(renderToLocal, sun.direction));
    const diffuse = sun.diffuse;
    const ambient = sun.ambient;
    const diffuseEnergy = Math.max(...diffuse.color) * diffuse.intensity;
    const sunBelowHorizon = diffuseEnergy <= 1e-3;
    if (this._lastSunBelowHorizon !== sunBelowHorizon) {
      this._lastSunBelowHorizon = sunBelowHorizon;
      this.onSunBelowHorizon?.(sunBelowHorizon);
    }

    // SceneView may render at a resolution that differs from the canvas backing
    // store. Accumulation must follow the actual pipeline attachment exactly.
    const width = rasterizedDescriptor?.descriptor?.width ?? camera.viewport[2];
    const height = rasterizedDescriptor?.descriptor?.height ?? camera.viewport[3];
    const cameraSignature = new Float64Array([
      ...camera.eye,
      ...camera.center,
      ...camera.up,
      camera.fovX,
      camera.fovY,
    ]);
    const sunSignature = new Float64Array([
      ...sun.direction,
      ...diffuse.color,
      diffuse.intensity,
      ...ambient.color,
      ambient.intensity,
    ]);
    const reset =
      this._forceReset ||
      !this._accumulation ||
      this._accumulationWidth !== width ||
      this._accumulationHeight !== height ||
      this._lastIndirectBounces !== this.indirectBounces ||
      this._lastSingleSample !== this.singleSample ||
      this._lastScene !== packedScene ||
      signatureChanged(this._cameraSignature, cameraSignature, 6) ||
      signatureChanged(this._sunSignature, sunSignature, 0);

    if (reset) {
      this.sampleIndex = 1;
      this.releaseAccumulation();
    }
    this._forceReset = false;
    this._cameraSignature = cameraSignature;
    this._sunSignature = sunSignature;
    this._accumulationWidth = width;
    this._accumulationHeight = height;
    this._lastIndirectBounces = this.indirectBounces;
    this._lastSingleSample = this.singleSample;
    this._lastScene = packedScene;

    if (!reset && !this.singleSample && this.sampleIndex > TRACE_LIMITS.maxSamplesPerPixel) {
      const settledTexture = textureName(this._accumulation?.getTexture());
      return settledTexture
        ? composite(this, input, rasterizedTexture, settledTexture)
        : this.bindRenderTarget();
    }

    const inverseSample = this.singleSample ? 1 : 1 / this.sampleIndex;
    const accumulationNew = this.acquireOutputFramebuffer();
    establishFullscreenState(gl, width, height);
    gl.useProgram(this._traceProgram);
    gl.bindVertexArray(this._traceVao ?? null);

    const previousTexture = textureName(this._accumulation?.getTexture());
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, previousTexture ?? rasterizedTexture);
    gl.uniform1i(traceLocations.uAccumPrevious, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, depthTexture);
    gl.uniform1i(traceLocations.uDepth, 1);
    gl.uniform1f(traceLocations.uNear, camera.near);
    gl.uniform1f(traceLocations.uFar, camera.far);
    gl.uniform3f(traceLocations.uEye, ...localEye);
    gl.uniform3f(traceLocations.uForward, ...localForward);
    gl.uniform3f(traceLocations.uRight, ...localRight);
    gl.uniform3f(traceLocations.uUp, ...localUp);
    gl.uniform1f(traceLocations.uTanX, Math.tan(camera.fovX / 2));
    gl.uniform1f(traceLocations.uTanY, Math.tan(camera.fovY / 2));
    gl.uniform1i(traceLocations.uSolidCount, packedScene.solidCount);
    gl.uniform4fv(traceLocations.uPlaneEquations, packedScene.planeEquations);
    gl.uniform1iv(traceLocations.uPlaneCounts, packedScene.planeCounts);
    gl.uniform1iv(traceLocations.uMaterialIndices, packedScene.materialIndices);
    gl.uniform3fv(traceLocations.uMaterialAlbedos, packedScene.materialAlbedos);
    gl.uniform3f(traceLocations.uSunDirection, ...directionToSun);
    gl.uniform3f(
      traceLocations.uSunDiffuse,
      diffuse.color[0] * diffuse.intensity,
      diffuse.color[1] * diffuse.intensity,
      diffuse.color[2] * diffuse.intensity,
    );
    gl.uniform3f(
      traceLocations.uSunAmbient,
      ambient.color[0] * ambient.intensity,
      ambient.color[1] * ambient.intensity,
      ambient.color[2] * ambient.intensity,
    );
    gl.uniform1i(traceLocations.uIndirectBounces, this.indirectBounces);
    gl.uniform2f(traceLocations.uResolution, width, height);
    gl.uniform1ui(traceLocations.uFrame, this.sampleIndex >>> 0);
    gl.uniform1f(traceLocations.uInverseSample, inverseSample);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const previousAccumulation = this._accumulation;
    this._accumulation = accumulationNew;
    if (previousAccumulation) previousAccumulation.release();

    const accumulationTexture = textureName(accumulationNew.getTexture());
    if (!accumulationTexture) {
      this.releaseAccumulation();
      return this.bindRenderTarget();
    }
    const output = composite(this, input, rasterizedTexture, accumulationTexture);

    const completedSample = this.sampleIndex;
    if (
      completedSample === 1 ||
      completedSample % 10 === 0 ||
      completedSample >= TRACE_LIMITS.maxSamplesPerPixel
    ) {
      this.onSample?.(Math.min(completedSample, TRACE_LIMITS.maxSamplesPerPixel));
    }
    if (!this.singleSample && completedSample < TRACE_LIMITS.maxSamplesPerPixel) {
      this.sampleIndex = completedSample + 1;
      this.requestRender();
    } else if (!this.singleSample) {
      this.sampleIndex = TRACE_LIMITS.maxSamplesPerPixel + 1;
    }
    return output;
  } finally {
    this.resetWebGLState();
  }
}

export const PathTraceRenderNode = RenderNode.createSubclass({
  declaredClass: "cge.PathTraceRenderNode",
  scene: null,
  renderToLocal: null,
  indirectBounces: TRACE_LIMITS.defaultIndirectBounces,
  singleSample: false,
  broken: false,
  onBroken: null,
  onSample: null,
  onSunBelowHorizon: null,
  sampleIndex: 1,
  _accumulation: null,
  _accumulationWidth: 0,
  _accumulationHeight: 0,
  _cameraSignature: null,
  _sunSignature: null,
  _lastIndirectBounces: TRACE_LIMITS.defaultIndirectBounces,
  _lastSingleSample: false,
  _lastScene: null,
  _lastSunBelowHorizon: null,
  _forceReset: false,
  _gl: null,
  render: renderPathTrace,
  releaseAccumulation(this: PathTraceNode): void {
    if (this._accumulation) {
      this._accumulation.release();
      this._accumulation = null;
    }
  },
  resetAccumulation(this: PathTraceNode): void {
    this._forceReset = true;
    this.sampleIndex = 1;
    this.onSample?.(1);
    this.requestRender();
  },
  destroy(this: PathTraceNode): void {
    this.releaseAccumulation();
    const gl = this._gl;
    if (gl) {
      if (this._traceProgram) gl.deleteProgram(this._traceProgram);
      if (this._compositeProgram) gl.deleteProgram(this._compositeProgram);
      if (this._traceVao) gl.deleteVertexArray(this._traceVao);
      if (this._compositeVao) gl.deleteVertexArray(this._compositeVao);
    }
    this._traceProgram = null;
    this._compositeProgram = null;
    this._traceVao = null;
    this._compositeVao = null;
    this._gl = null;
  },
}) as unknown as new (properties: {
  view: SceneView;
  consumes: ConsumedNodes;
  produces: RenderNodeOutput;
}) => PathTraceNode;
