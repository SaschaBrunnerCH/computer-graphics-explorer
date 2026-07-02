import { useRef, useState } from "react";
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
 * Your own GLSL, running inside a production GIS engine. The SceneView's
 * public (experimental) `RenderNode` API exposes named stages of its render
 * pipeline — `opaque-color`, `transparent-color`, `composite-color`,
 * `final-color` — and lets a custom WebGL pass consume one of them as a
 * texture and produce its replacement. This demo injects a posterize fragment
 * shader: the texture it reads IS the engine's framebuffer at that stage
 * (that's the frame-buffer lesson), the GLSL is a real shader you can read
 * below in the source (the shader lesson), and the stage picker shows the
 * pipeline order — inject early and every later stage (transparency,
 * atmosphere, antialiasing) still draws on top of your effect, untouched
 * (the render-pipeline lesson).
 *
 * The fullscreen triangle uses the WebGL2 gl_VertexID trick, so the pass
 * needs no vertex buffers at all. State safety: we save nothing and instead
 * call `resetWebGLState()` after drawing — conservative but bulletproof, and
 * this is a teaching demo, not a perf-critical effect.
 */

const OSM_BUILDINGS_URL =
  "https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer";
const OSM_BUILDINGS_ID = "osm-3d-buildings-shader";

/** Zurich old town — dense roofs, the river, and at dusk some transparency. */
const CAMERA = { position: "8.5417, 47.3655, 650", heading: 20, tilt: 65 };

const VERT = `#version 300 es
out vec2 vUv;
void main() {
  // One triangle that covers the screen: (-1,-1) (3,-1) (-1,3).
  vec2 pos = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  vUv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uColor;
uniform float uLevels;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec4 c = texture(uColor, vUv);
  // Posterize: quantize each channel to uLevels bands.
  vec3 q = floor(c.rgb * uLevels) / max(uLevels - 1.0, 1.0);
  fragColor = vec4(min(q, 1.0), c.a);
}`;

/**
 * A post-processing node: reads the stage it produces as a texture, draws a
 * posterized fullscreen triangle into a fresh output framebuffer, and carries
 * the input's depth attachment over (the engine expects matching attachments).
 *
 * Built with `RenderNode.createSubclass` (the SDK's no-decorator subclassing
 * path) because Vite's react plugin can't parse decorator syntax.
 */
interface PosterizeNode extends RenderNode {
  /** Posterization band count; the slider writes this then requestRender()s. */
  levels: number;
  /** Set when shader compilation failed — render then passes frames through. */
  broken: boolean;
  /** Called once if compilation fails so the UI can say so honestly. */
  onBroken: (() => void) | null;
  _program?: WebGLProgram | null;
  _vao?: WebGLVertexArrayObject | null;
  _uColor?: WebGLUniformLocation | null;
  _uLevels?: WebGLUniformLocation | null;
}

const compileProgram = (node: PosterizeNode, gl: WebGL2RenderingContext): boolean => {
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
  node._uLevels = gl.getUniformLocation(program, "uLevels");
  return true;
};

function renderPosterize(this: PosterizeNode, inputs: ManagedFBO[]): ManagedFBO | null | undefined {
  const input = inputs.find(({ name }) => name === this.produces);
  if (!input) return undefined;
  if (this.broken) return this.bindRenderTarget();

  const gl = this.gl;
  if (!this._program && !compileProgram(this, gl)) {
    this.broken = true;
    this.onBroken?.();
    return this.bindRenderTarget();
  }

  // The typings keep FBO internals opaque (FBOTexture is empty), but the
  // official RenderNode samples read `.glName` — narrow it locally.
  const texture = input.getTexture() as { glName?: WebGLTexture } | null | undefined;
  if (!texture?.glName || !this._program) return this.bindRenderTarget();

  // acquireOutputFramebuffer() binds a fresh color0 target at input size.
  const output = this.acquireOutputFramebuffer();
  gl.useProgram(this._program);
  gl.bindVertexArray(this._vao ?? null);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture.glName);
  gl.uniform1i(this._uColor ?? null, 0);
  gl.uniform1f(this._uLevels ?? null, this.levels);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // The engine expects the output to carry the same attachments as the
  // input — reuse its depth (and don't touch it).
  const depth = input.getAttachment(gl.DEPTH_STENCIL_ATTACHMENT);
  if (depth && "glName" in depth) {
    output.attachDepth(depth);
  }
  // Conservative but bulletproof: hand WebGL back in a known-good state.
  this.resetWebGLState();
  return output;
}

const PosterizeRenderNode = RenderNode.createSubclass({
  declaredClass: "cge.PosterizeRenderNode",
  levels: 6,
  broken: false,
  onBroken: null,
  render: renderPosterize,
}) as unknown as new (props: {
  view: SceneView;
  consumes: ConsumedNodes;
  produces: RenderNodeOutput;
}) => PosterizeNode;

const SLOTS: { value: RenderNodeOutput; label: string }[] = [
  { value: "opaque-color", label: "Opaque" },
  { value: "transparent-color", label: "Transparent" },
  { value: "composite-color", label: "Composite" },
  { value: "final-color", label: "Final" },
];

const SLOT_NOTES: Record<RenderNodeOutput, string> = {
  "opaque-color":
    "injected right after solid geometry — transparency, atmosphere and antialiasing all run AFTER your shader and draw over it un-posterized",
  "transparent-color":
    "after transparent geometry too — but compositing and post-processing still run after you",
  "composite-color":
    "the assembled frame before post-processing — antialiasing will still smooth your hard bands",
  "final-color": "the very last word: your shader sees the finished frame, post-effects included",
};

const INITIAL = { enabled: true, levels: 6, slot: "composite-color" as RenderNodeOutput };

export default function SceneShader(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const nodeRef = useRef<PosterizeNode | null>(null);
  const [enabled, setEnabled] = useState(INITIAL.enabled);
  const [levels, setLevels] = useState(INITIAL.levels);
  const [slot, setSlot] = useState<RenderNodeOutput>(INITIAL.slot);
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

  /** (Re)create the render node on the live view for the given stage. */
  const createNode = (el: HTMLArcgisSceneElement, s: RenderNodeOutput, lv: number): void => {
    destroyNode();
    const node = new PosterizeRenderNode({
      view: el.view as SceneView,
      consumes: { required: [s] },
      produces: s,
    });
    node.levels = lv;
    node.onBroken = () => setBroken(true);
    nodeRef.current = node;
    node.requestRender();
  };

  const handleViewReady = (event: { target: HTMLArcgisSceneElement }): void => {
    const el = event.target;
    // StrictMode double-mounts re-fire this with a fresh view: the old node
    // died with the old view, so just create a new one; layer add is guarded.
    if (el.map && !el.map.findLayerById(OSM_BUILDINGS_ID)) {
      el.map.add(
        new SceneLayer({ id: OSM_BUILDINGS_ID, url: OSM_BUILDINGS_URL, title: "OSM 3D Buildings" }),
      );
    }
    if (enabled) createNode(el, slot, levels);
  };

  const caption = broken
    ? "The shader failed to compile on this GPU — the scene renders untouched. That failure mode is honest too: custom pipeline injection is experimental, expert-level API."
    : enabled
      ? `Posterizing to ${levels} bands at the “${SLOTS.find((s) => s.value === slot)?.label}” stage — ${SLOT_NOTES[slot]}. The texture the shader reads is the engine's actual framebuffer for that stage.`
      : "Shader off — this is the engine's own pipeline, end to end. Switch the shader on to splice your own GLSL between two of its stages.";

  return (
    <PlaygroundFrame
      title="Your GLSL inside the engine — a RenderNode over Zurich"
      caption={caption}
      onReset={() => {
        setEnabled(INITIAL.enabled);
        setLevels(INITIAL.levels);
        setSlot(INITIAL.slot);
        setBroken(false);
        const el = readyScene();
        if (!el) return;
        createNode(el, INITIAL.slot, INITIAL.levels);
      }}
      controls={
        <>
          <SwitchControl
            label="Custom shader"
            checked={enabled}
            onChange={(on) => {
              setEnabled(on);
              const el = readyScene();
              if (!el) return;
              if (on) createNode(el, slot, levels);
              else destroyNode();
            }}
          />
          <SliderControl
            label="Posterize levels"
            value={levels}
            min={2}
            max={16}
            step={1}
            onInput={(v) => {
              setLevels(v);
              const node = nodeRef.current;
              if (node && !node.destroyed) {
                node.levels = v;
                node.requestRender();
              }
            }}
          />
          <SegmentedControl<RenderNodeOutput>
            label="Inject after stage"
            value={slot}
            options={SLOTS}
            onChange={(s) => {
              setSlot(s);
              const el = readyScene();
              if (el && enabled) createNode(el, s, levels);
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            A shader is a small GPU program; a framebuffer is the texture a pipeline stage renders
            into. This demo's fragment shader (≈10 lines of GLSL, in the page source) samples the
            stage's framebuffer and quantizes each color channel — and the stage picker is the
            render pipeline made tangible: whatever runs after your injection point paints over your
            effect. Uses the SceneView's experimental public RenderNode API.
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
