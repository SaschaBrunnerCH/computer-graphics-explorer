import { useEffect, useRef, useState } from "react";
import Camera from "@arcgis/core/Camera.js";
import SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import type SceneView from "@arcgis/core/views/SceneView.js";
import RenderNode from "@arcgis/core/views/3d/webgl/RenderNode.js";
import type ManagedFBO from "@arcgis/core/views/3d/webgl/ManagedFBO.js";
import type { RenderNodeOutput, ConsumedNodes } from "@arcgis/core/views/3d/webgl.js";
import "@arcgis/map-components/components/arcgis-scene";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Accumulation motion blur, built from a RenderNode that HOLDS a framebuffer
 * across frames. Each frame the node blends the engine's fresh composite-color
 * with the blended result it kept from last frame: `mix(current, history,
 * strength)`. Feed that back frame after frame and moving geometry leaves an
 * exponentially-fading trail — the same trick early games and long-exposure
 * photography used to smear motion. It is NOT per-pixel velocity-buffer motion
 * blur (which stretches each pixel along its own screen-space velocity in a
 * single frame); this is honest temporal accumulation, and the caption says so.
 *
 * The graphics lesson that makes it work: an FBO returned from `render()` is
 * released once by the engine after the frame, so to reuse one as history we
 * `retain()` it once per frame (our extra reference) and `release()` the one it
 * replaces — the exact bookkeeping the SDK's crossfade sample uses to hold an
 * FBO. At steady state the node holds exactly one framebuffer.
 *
 * The smear only exists while something MOVES, so the view auto-orbits a
 * downtown pivot (the TreeInstancing rAF pattern). Stop the orbit and the
 * history keeps blending the now-static frame: the trail collapses on its own,
 * because it was never a filter — it was time.
 */

const OSM_BUILDINGS_URL =
  "https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer";
const OSM_BUILDINGS_ID = "osm-3d-buildings-mb";

/** Frankfurt's banking district — a dense cluster of towers to smear. */
const PIVOT = { lon: 8.6821, lat: 50.1109, groundZ: 110 };
const ORBIT = { height: 600, tilt: 65 };

const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = 111_320 * Math.cos((PIVOT.lat * Math.PI) / 180);
/** Degrees advanced per 60 fps frame at slider value 1 — scaled by real dt. */
const FRAME_MS = 1000 / 60;
/** After the orbit stops, keep rendering this many frames so the trail fades out. */
const SETTLE_FRAMES = 90;

/** Camera orbiting the pivot at `angle` (radians), looking inward and down. */
function cameraFor(angle: number): Camera {
  const radius = ORBIT.height * Math.tan((ORBIT.tilt * Math.PI) / 180);
  const longitude = PIVOT.lon + (radius * Math.sin(angle)) / M_PER_DEG_LON;
  const latitude = PIVOT.lat + (radius * Math.cos(angle)) / M_PER_DEG_LAT;
  const heading = ((angle * 180) / Math.PI + 180) % 360;
  return new Camera({
    position: { longitude, latitude, z: PIVOT.groundZ + ORBIT.height },
    heading,
    tilt: ORBIT.tilt,
  });
}

const START = cameraFor(0);

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
uniform sampler2D uCurrent;
uniform sampler2D uHistory;
uniform float uStrength;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec4 cur = texture(uCurrent, vUv);
  vec4 hist = texture(uHistory, vUv);
  // strength 0.85 → 15% new frame, 85% carried-over history: an exponential trail.
  fragColor = mix(cur, hist, uStrength);
}`;

/**
 * A post-processing node on composite-color that accumulates frames into a
 * trail. It keeps one output framebuffer alive across frames (`_history`) to
 * sample as the previous blended image.
 *
 * Built with `RenderNode.createSubclass` (the SDK's no-decorator subclassing
 * path) because Vite's react plugin can't parse decorator syntax.
 */
interface MotionBlurNode extends RenderNode {
  /** History weight 0–0.95; the slider writes this. 0 = passthrough. */
  strength: number;
  /** Set when shader compilation failed — render then passes frames through. */
  broken: boolean;
  /** Called once if compilation fails so the UI can say so honestly. */
  onBroken: (() => void) | null;
  /** The blended output kept (retained) from last frame, or null before the first. */
  _history: ManagedFBO | null;
  _histW: number;
  _histH: number;
  _program?: WebGLProgram | null;
  _vao?: WebGLVertexArrayObject | null;
  _uCurrent?: WebGLUniformLocation | null;
  _uHistory?: WebGLUniformLocation | null;
  _uStrength?: WebGLUniformLocation | null;
  /** Drop the held history FBO (call before destroying the node). */
  releaseHistory: () => void;
}

const compileProgram = (node: MotionBlurNode, gl: WebGL2RenderingContext): boolean => {
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
  node._uCurrent = gl.getUniformLocation(program, "uCurrent");
  node._uHistory = gl.getUniformLocation(program, "uHistory");
  node._uStrength = gl.getUniformLocation(program, "uStrength");
  return true;
};

function renderMotionBlur(
  this: MotionBlurNode,
  inputs: ManagedFBO[],
): ManagedFBO | null | undefined {
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
  const curTex = input.getTexture() as { glName?: WebGLTexture } | null | undefined;
  if (!curTex?.glName || !this._program) return this.bindRenderTarget();

  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  // Reset the trail on the first frame or whenever the drawing buffer resizes:
  // a stale history at the old size can't be blended against the new frame.
  const reset = !this._history || this._histW !== w || this._histH !== h;

  // acquireOutputFramebuffer() binds a fresh color0 target at input size. It is
  // acquired while `_history` is still retained, so the pool hands back a
  // different framebuffer — never the one we are about to sample.
  const output = this.acquireOutputFramebuffer();
  gl.useProgram(this._program);
  gl.bindVertexArray(this._vao ?? null);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, curTex.glName);
  gl.uniform1i(this._uCurrent ?? null, 0);

  // On a reset frame there is no valid history; bind the current frame to the
  // history sampler and force strength 0, so the pass is a plain copy that
  // seeds `_history` with a correctly-sized framebuffer.
  const histTex = reset
    ? curTex
    : (this._history?.getTexture() as { glName?: WebGLTexture } | null | undefined);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, histTex?.glName ?? curTex.glName);
  gl.uniform1i(this._uHistory ?? null, 1);
  gl.uniform1f(this._uStrength ?? null, reset ? 0 : this.strength);

  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // The engine expects the output to carry the same attachments as the input —
  // reuse its depth (and don't touch it).
  const depth = input.getAttachment(gl.DEPTH_STENCIL_ATTACHMENT);
  if (depth && "glName" in depth) output.attachDepth(depth);

  // Retain/release bookkeeping to hold a framebuffer across frames (mirrors the
  // SDK crossfade sample): the engine releases every returned FBO once after
  // the frame, so retain() gives `output` the extra reference that keeps it
  // alive to be sampled next frame; the matching release() drops the previous
  // history we no longer need. Order matters — acquire and sample happen while
  // the old history is still retained, and we release it only at the very end.
  const previous = this._history;
  output.retain();
  this._history = output;
  this._histW = w;
  this._histH = h;
  if (previous) previous.release();

  // Conservative but bulletproof: hand WebGL back in a known-good state.
  this.resetWebGLState();
  return output;
}

const MotionBlurRenderNode = RenderNode.createSubclass({
  declaredClass: "cge.MotionBlurRenderNode",
  strength: 0.85,
  broken: false,
  onBroken: null,
  _history: null,
  _histW: 0,
  _histH: 0,
  render: renderMotionBlur,
  releaseHistory(this: MotionBlurNode): void {
    if (this._history) {
      this._history.release();
      this._history = null;
    }
  },
}) as unknown as new (props: {
  view: SceneView;
  consumes: ConsumedNodes;
  produces: RenderNodeOutput;
}) => MotionBlurNode;

const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const INITIAL = {
  autoOrbit: !prefersReducedMotion,
  strength: 0.85,
  speed: 0.1, // degrees per 60 fps frame
};

export default function SceneMotionBlur(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const nodeRef = useRef<MotionBlurNode | null>(null);
  const angleRef = useRef(0);
  const autoOrbitRef = useRef(INITIAL.autoOrbit);
  const strengthRef = useRef(INITIAL.strength);
  const speedRef = useRef(INITIAL.speed);
  // Frames of continued rendering left after the orbit stops (so the trail
  // fades out instead of freezing). Topped up every frame while orbiting.
  const settleRef = useRef(0);

  const [autoOrbit, setAutoOrbit] = useState(INITIAL.autoOrbit);
  const [strength, setStrength] = useState(INITIAL.strength);
  const [speed, setSpeed] = useState(INITIAL.speed);
  const [broken, setBroken] = useState(false);

  // Mirror the live controls into refs the rAF loop reads (ref writes in an
  // effect are lint-safe; writing them during render would not be).
  useEffect(() => {
    autoOrbitRef.current = autoOrbit;
  }, [autoOrbit]);
  useEffect(() => {
    strengthRef.current = strength;
  }, [strength]);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  /** True once the view exists; all imperative access goes through this. */
  const readyScene = (): HTMLArcgisSceneElement | null => {
    const el = sceneRef.current;
    return el && el.view ? el : null;
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
    const node = new MotionBlurRenderNode({
      view: el.view as SceneView,
      consumes: { required: ["composite-color"] },
      produces: "composite-color",
    });
    node.strength = strengthRef.current;
    node.onBroken = () => setBroken(true);
    nodeRef.current = node;
  };

  // One rAF loop owns the orbit. While orbiting it assigns view.camera each
  // frame (which redraws the view, and every redraw runs the node's render()).
  // When the orbit stops we keep requesting a bounded number of frames so the
  // accumulated trail blends toward the now-static image and visibly collapses,
  // then idle — rather than spamming requestRender() forever. The effect owns
  // start/stop so lint and StrictMode stay happy.
  useEffect(() => {
    let raf = 0;
    let lastNow = performance.now();

    const onVisibility = (): void => {
      if (!document.hidden) lastNow = performance.now();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const tick = (now: number): void => {
      const dt = Math.min(now - lastNow, 250);
      lastNow = now;

      if (!document.hidden) {
        const el = readyScene();
        if (el) {
          if (autoOrbitRef.current) {
            const deg = speedRef.current * (dt / FRAME_MS);
            angleRef.current += (deg * Math.PI) / 180;
            el.view.camera = cameraFor(angleRef.current);
            settleRef.current = SETTLE_FRAMES;
          } else if (settleRef.current > 0 && strengthRef.current > 0) {
            // Motion stopped: no camera change means no natural redraw, so pump
            // a few frames by hand to let the history converge to the static
            // frame — the trail dies because it was accumulated time, not a filter.
            settleRef.current -= 1;
            nodeRef.current?.requestRender();
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Release the held history FBO and destroy the node on unmount. In StrictMode
  // the node may already have died with its view; guard on `destroyed`.
  useEffect(() => {
    return () => {
      const node = nodeRef.current;
      if (node && !node.destroyed) {
        node.releaseHistory();
        node.destroy();
      }
      nodeRef.current = null;
    };
  }, []);

  const caption = broken
    ? "The shader failed to compile on this GPU — the scene renders untouched. That failure mode is honest too: custom pipeline injection is experimental, expert-level API."
    : strength <= 0
      ? "Blur strength 0 — the node runs but copies each frame straight through, so there is no trail. Raise the strength and start the orbit to accumulate one."
      : autoOrbit
        ? `Strength ${strength.toFixed(2)} while orbiting: each frame is ${Math.round((1 - strength) * 100)}% new image and ${Math.round(strength * 100)}% carried-over history, so the skyline smears exactly as far as it moved this frame. Stop the orbit and the trail collapses.`
        : `Orbit stopped. With nothing moving, the accumulated frames converge on the same static image and the trail fades out — it was never a filter, it was time. Start the orbit to smear it again.`;

  return (
    <PlaygroundFrame
      title="Accumulation motion blur — a RenderNode holding a frame over Frankfurt"
      caption={caption}
      onReset={() => {
        setAutoOrbit(INITIAL.autoOrbit);
        autoOrbitRef.current = INITIAL.autoOrbit;
        setStrength(INITIAL.strength);
        strengthRef.current = INITIAL.strength;
        const node = nodeRef.current;
        if (node && !node.destroyed) node.strength = INITIAL.strength;
        setSpeed(INITIAL.speed);
        speedRef.current = INITIAL.speed;
        angleRef.current = 0;
        settleRef.current = SETTLE_FRAMES;
        const el = readyScene();
        if (el) void el.goTo(cameraFor(0)).catch(() => undefined);
      }}
      controls={
        <>
          <SwitchControl label="Auto-orbit" checked={autoOrbit} onChange={setAutoOrbit} />
          <SliderControl
            label="Blur strength"
            value={strength}
            min={0}
            max={0.95}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onInput={(v) => {
              setStrength(v);
              strengthRef.current = v;
              const node = nodeRef.current;
              if (node && !node.destroyed) {
                node.strength = v;
                // A redraw already happens each orbit frame; nudge one render
                // when paused so the change is visible immediately.
                if (!autoOrbitRef.current) node.requestRender();
              }
              // Let a paused trail settle to the new strength.
              settleRef.current = SETTLE_FRAMES;
            }}
          />
          <SliderControl
            label="Orbit speed"
            value={speed}
            min={0.02}
            max={0.3}
            step={0.02}
            format={(v) => `${v.toFixed(2)}°/frame`}
            onInput={(v) => {
              setSpeed(v);
              speedRef.current = v;
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Motion blur is the integral of the scene's light over the camera's shutter interval.
            This demo approximates that integral with frame history — a RenderNode that keeps its
            last output framebuffer and blends the new frame into it, so moving geometry leaves an
            exponentially-fading trail. Modern games instead build a per-pixel velocity buffer and
            stretch each pixel along its own motion in a single frame; this accumulation approach is
            the older, long-exposure-style cousin. Uses the SceneView's experimental RenderNode API.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="osm"
        ground="world-elevation"
        cameraPosition={`${START.position.longitude}, ${START.position.latitude}, ${START.position.z}`}
        cameraHeading={START.heading}
        cameraTilt={START.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
    </PlaygroundFrame>
  );
}
