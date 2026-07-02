import { useRef, useState } from "react";
import Camera from "@arcgis/core/Camera.js";
import SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import type SceneView from "@arcgis/core/views/SceneView.js";
import RenderNode from "@arcgis/core/views/3d/webgl/RenderNode.js";
import type ManagedFBO from "@arcgis/core/views/3d/webgl/ManagedFBO.js";
import type { RenderNodeOutput, ConsumedNodes } from "@arcgis/core/views/3d/webgl.js";
import "@arcgis/map-components/components/arcgis-scene";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl, SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Depth of field, straight from the engine's depth buffer. A `RenderNode`
 * consumes the assembled frame (`composite-color`) plus its depth attachment,
 * and runs a fullscreen post-process: each pixel's distance in metres comes
 * from linearizing the same depth texture the z-fighting demo abuses, and a
 * simplified circle of confusion turns "how far from the focus plane" into a
 * blur radius in pixels. Taps are gathered with a 12-sample poisson disk.
 *
 * This is the standard game-style post-process DoF — a depth-driven gather
 * blur, not a physical thin-lens simulation (no bokeh shape, no chromatic
 * effects). The depth-fetch and linearization follow Esri's own custom
 * RenderNode DoF sample; the fullscreen triangle uses the WebGL2 gl_VertexID
 * trick, and we call `resetWebGLState()` after drawing rather than saving.
 */

const OSM_BUILDINGS_URL =
  "https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer";
const OSM_BUILDINGS_ID = "osm-3d-buildings-dof";

type CameraPreset = "street" | "across";

const CAMERAS: Record<
  CameraPreset,
  { position: [number, number, number]; heading: number; tilt: number }
> = {
  // Down inside a Zurich old-town street: the near façade sits ~30 m away, the
  // opposite row ~200 m, the skyline beyond — a wide depth range in one frame.
  street: { position: [8.5423, 47.3705, 415], heading: 25, tilt: 86 },
  // Aimed along a long street axis, so the depth range runs from a few metres
  // to the far skyline — the most punishing test for a focus plane.
  across: { position: [8.5411, 47.3688, 420], heading: 108, tilt: 88 },
};

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
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform float uNear;
uniform float uFar;
uniform float uFocus;
uniform float uMaxBlur;
uniform vec2 uResolution;
in vec2 vUv;
out vec4 fragColor;

const vec2 POISSON[12] = vec2[12](
  vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696, 0.457),
  vec2(-0.203, 0.621), vec2(0.962, -0.195), vec2(0.473, -0.480),
  vec2(0.519, 0.767), vec2(0.185, -0.893), vec2(0.507, 0.064),
  vec2(0.896, 0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598)
);

float linearDepth(vec2 uv) {
  // Read the engine's depth buffer (red channel) and undo the perspective
  // non-linearity with the SceneView's own near/far — Esri's DoF sample formula.
  float d = texture(uDepth, uv).r;
  float ndc = d * 2.0 - 1.0;
  return abs((2.0 * uNear * uFar) / (ndc * (uFar - uNear) - (uFar + uNear)));
}

void main() {
  float centerDist = linearDepth(vUv);
  // Simplified circle of confusion: blur grows with distance from the focus
  // plane, normalised by the pixel's own distance (a thin-lens-ish feel, not a
  // physical lens model).
  float coc = clamp(uMaxBlur * abs(centerDist - uFocus) / centerDist, 0.0, uMaxBlur);

  vec3 sum = texture(uColor, vUv).rgb;
  float weight = 1.0;
  vec2 radius = coc / uResolution;
  for (int i = 0; i < 12; i++) {
    vec2 uv = vUv + POISSON[i] * radius;
    // Drop taps well in front of the centre so a sharp foreground edge doesn't
    // bleed onto blurred background (single depth compare is enough).
    float w = linearDepth(uv) < centerDist - 2.0 ? 0.0 : 1.0;
    sum += texture(uColor, uv).rgb * w;
    weight += w;
  }
  fragColor = vec4(sum / weight, 1.0);
}`;

/**
 * A post-processing node: reads `composite-color` and its depth attachment,
 * blurs by depth into a fresh output framebuffer, and carries the input's
 * depth across (the engine expects matching attachments). Built with
 * `RenderNode.createSubclass` because Vite's react plugin can't parse the
 * decorator (`@subclass`) form.
 */
interface DofNode extends RenderNode {
  /** Focus plane distance in metres; the slider writes this then requestRender()s. */
  focusMeters: number;
  /** Maximum blur radius in pixels at the aperture extreme. */
  maxBlurPx: number;
  /** Set when shader compilation failed — render then passes frames through. */
  broken: boolean;
  /** Called once if compilation fails so the UI can say so honestly. */
  onBroken: (() => void) | null;
  _program?: WebGLProgram | null;
  _vao?: WebGLVertexArrayObject | null;
  _uColor?: WebGLUniformLocation | null;
  _uDepth?: WebGLUniformLocation | null;
  _uNear?: WebGLUniformLocation | null;
  _uFar?: WebGLUniformLocation | null;
  _uFocus?: WebGLUniformLocation | null;
  _uMaxBlur?: WebGLUniformLocation | null;
  _uResolution?: WebGLUniformLocation | null;
}

const compileProgram = (node: DofNode, gl: WebGL2RenderingContext): boolean => {
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
  node._uColor = gl.getUniformLocation(program, "uColor");
  node._uDepth = gl.getUniformLocation(program, "uDepth");
  node._uNear = gl.getUniformLocation(program, "uNear");
  node._uFar = gl.getUniformLocation(program, "uFar");
  node._uFocus = gl.getUniformLocation(program, "uFocus");
  node._uMaxBlur = gl.getUniformLocation(program, "uMaxBlur");
  node._uResolution = gl.getUniformLocation(program, "uResolution");
  return true;
};

function renderDof(this: DofNode, inputs: ManagedFBO[]): ManagedFBO | null | undefined {
  const input = inputs.find(({ name }) => name === this.produces);
  if (!input) return undefined;
  if (this.broken) return this.bindRenderTarget();

  const gl = this.gl;
  if (!this._program && !compileProgram(this, gl)) {
    this.broken = true;
    this.onBroken?.();
    return this.bindRenderTarget();
  }

  // The typings keep FBO textures opaque (FBOTexture is empty), but the official
  // RenderNode samples read `.glName` — narrow it locally. Color is the default
  // attachment; depth comes from getTexture(DEPTH_STENCIL_ATTACHMENT), exactly
  // as Esri's DoF sample does.
  const fbo = input as unknown as {
    getTexture(attachment?: number): { glName?: WebGLTexture } | null | undefined;
  };
  const colorTex = fbo.getTexture();
  const depthTex = fbo.getTexture(gl.DEPTH_STENCIL_ATTACHMENT);
  if (!colorTex?.glName || !depthTex?.glName || !this._program) return this.bindRenderTarget();

  // RenderNode.camera is a RenderCamera carrying the frame's near/far planes.
  const cam = (this as unknown as { camera?: { near: number; far: number } }).camera;
  const near = cam?.near ?? 1;
  const far = cam?.far ?? 1000;

  // acquireOutputFramebuffer() binds a fresh color0 target at input size.
  const output = this.acquireOutputFramebuffer();
  gl.useProgram(this._program);
  gl.bindVertexArray(this._vao ?? null);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, colorTex.glName);
  gl.uniform1i(this._uColor ?? null, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, depthTex.glName);
  gl.uniform1i(this._uDepth ?? null, 1);
  gl.uniform1f(this._uNear ?? null, near);
  gl.uniform1f(this._uFar ?? null, far);
  gl.uniform1f(this._uFocus ?? null, this.focusMeters);
  gl.uniform1f(this._uMaxBlur ?? null, this.maxBlurPx);
  gl.uniform2f(this._uResolution ?? null, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // The engine expects the output to carry the same attachments as the input —
  // reuse its depth (and don't touch it).
  const depth = input.getAttachment(gl.DEPTH_STENCIL_ATTACHMENT);
  if (depth && "glName" in depth) {
    output.attachDepth(depth);
  }
  // Conservative but bulletproof: hand WebGL back in a known-good state.
  this.resetWebGLState();
  return output;
}

const DofRenderNode = RenderNode.createSubclass({
  declaredClass: "cge.DofRenderNode",
  focusMeters: 120,
  maxBlurPx: 12,
  broken: false,
  onBroken: null,
  render: renderDof,
}) as unknown as new (props: {
  view: SceneView;
  consumes: ConsumedNodes;
  produces: RenderNodeOutput;
}) => DofNode;

const INITIAL = {
  enabled: true,
  focus: 120,
  maxBlur: 12,
  preset: "street" as CameraPreset,
};

export default function SceneDof(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const nodeRef = useRef<DofNode | null>(null);
  const [enabled, setEnabled] = useState(INITIAL.enabled);
  const [focus, setFocus] = useState(INITIAL.focus);
  const [maxBlur, setMaxBlur] = useState(INITIAL.maxBlur);
  const [preset, setPreset] = useState<CameraPreset>(INITIAL.preset);
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

  /** (Re)create the DoF node on the live view with the current settings. */
  const createNode = (el: HTMLArcgisSceneElement, f: number, b: number): void => {
    destroyNode();
    const node = new DofRenderNode({
      view: el.view as SceneView,
      consumes: { required: ["composite-color"] },
      produces: "composite-color",
    });
    node.focusMeters = f;
    node.maxBlurPx = b;
    node.onBroken = () => setBroken(true);
    nodeRef.current = node;
    node.requestRender();
  };

  const goToPreset = (el: HTMLArcgisSceneElement, p: CameraPreset): void => {
    const { position, heading, tilt } = CAMERAS[p];
    const [longitude, latitude, z] = position;
    void el
      .goTo(new Camera({ position: { longitude, latitude, z }, heading, tilt }))
      .catch(() => undefined); // interrupted animations reject — never crash on that
  };

  const handleViewReady = (event: { target: HTMLArcgisSceneElement }): void => {
    const el = event.target;
    // StrictMode double-mounts re-fire this with a fresh view: the old node died
    // with the old view, so just create a new one; layer add is guarded.
    if (el.map && !el.map.findLayerById(OSM_BUILDINGS_ID)) {
      el.map.add(
        new SceneLayer({ id: OSM_BUILDINGS_ID, url: OSM_BUILDINGS_URL, title: "OSM 3D Buildings" }),
      );
    }
    if (enabled) createNode(el, focus, maxBlur);
  };

  const caption = broken
    ? "The shader failed to compile on this GPU — the scene renders untouched. That failure mode is honest too: custom pipeline injection is experimental, expert-level API."
    : enabled
      ? `Focused at ${focus} m, aperture ${maxBlur} px — everything off the focus plane dissolves toward bokeh while the focus distance stays sharp. The per-pixel blur radius comes straight from the engine's depth buffer (the same buffer the z-fighting demo abuses). Real lenses do this optically; games do exactly this pass.`
      : "Depth of field off — the SceneView renders pin-sharp from the near façade to the far skyline, as a GIS view normally does. Switch it on to blur everything away from the focus plane.";

  return (
    <PlaygroundFrame
      title="Depth of field from the depth buffer — a RenderNode over Zurich"
      caption={caption}
      onReset={() => {
        setEnabled(INITIAL.enabled);
        setFocus(INITIAL.focus);
        setMaxBlur(INITIAL.maxBlur);
        setPreset(INITIAL.preset);
        setBroken(false);
        const el = readyScene();
        if (!el) return;
        createNode(el, INITIAL.focus, INITIAL.maxBlur);
        goToPreset(el, INITIAL.preset);
      }}
      controls={
        <>
          <SwitchControl
            label="Depth of field"
            checked={enabled}
            onChange={(on) => {
              setEnabled(on);
              const el = readyScene();
              if (!el) return;
              if (on) createNode(el, focus, maxBlur);
              else destroyNode();
            }}
          />
          <SliderControl
            label="Focus distance"
            value={focus}
            min={10}
            max={1500}
            step={10}
            format={(v) => `${v} m`}
            onInput={(v) => {
              setFocus(v);
              const node = nodeRef.current;
              if (node && !node.destroyed) {
                node.focusMeters = v;
                node.requestRender();
              }
            }}
          />
          <SliderControl
            label="Aperture (max blur)"
            value={maxBlur}
            min={0}
            max={24}
            step={1}
            format={(v) => `${v} px`}
            onInput={(v) => {
              setMaxBlur(v);
              const node = nodeRef.current;
              if (node && !node.destroyed) {
                node.maxBlurPx = v;
                node.requestRender();
              }
            }}
          />
          <SegmentedControl<CameraPreset>
            label="Camera"
            value={preset}
            options={[
              { value: "street", label: "Street" },
              { value: "across", label: "Across" },
            ]}
            onChange={(p) => {
              setPreset(p);
              const el = readyScene();
              if (el) goToPreset(el, p);
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            The circle of confusion is how large a point out of focus spreads on the sensor — grow
            it with distance from the focus plane and you get blur. This is the standard game-style
            post-process depth of field: a gather blur whose radius is read from the depth buffer,
            not a physical lens simulation (no true bokeh shape or optical aberrations). The
            depth-fetch and linearization follow Esri's own custom RenderNode DoF sample, using the
            SceneView's experimental public RenderNode API.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="osm"
        ground="world-elevation"
        cameraPosition="8.5423, 47.3705, 415"
        cameraHeading={CAMERAS.street.heading}
        cameraTilt={CAMERAS.street.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
    </PlaygroundFrame>
  );
}
