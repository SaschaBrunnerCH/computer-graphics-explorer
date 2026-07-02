import { useRef, useState } from "react";
import SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import type SceneView from "@arcgis/core/views/SceneView.js";
import RenderNode from "@arcgis/core/views/3d/webgl/RenderNode.js";
import type ManagedFBO from "@arcgis/core/views/3d/webgl/ManagedFBO.js";
import type { RenderNodeOutput, ConsumedNodes } from "@arcgis/core/views/3d/webgl.js";
import "@arcgis/map-components/components/arcgis-scene";
import "@esri/calcite-components/components/calcite-button";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Anti-aliasing made tangible, two honest ways.
 *
 * (A) Supersampling by screenshot: `view.takeScreenshot({width, height})`
 * genuinely RE-RENDERS the scene at the requested resolution (verified — these
 * are real new pixels, not an upscale of the canvas). We shoot the SAME frame
 * at ⅓×, 1× and 3×, crop the identical centre sub-region from each, and show
 * them at one tile size. The ⅓× and 1× tiles are magnified with nearest
 * filtering so their staircase edges show honestly; the 3× tile is first
 * averaged DOWN to the native display grid (9 rendered samples → 1 pixel) and
 * then magnified the same way — that downscale-average IS supersampling, the
 * oldest anti-aliasing there is.
 *
 * (B) A live FXAA post-pass: a `RenderNode` on `final-color` that runs a
 * compact luma-based reduced FXAA over the finished frame. The engine already
 * anti-aliases before this node; FXAA here is a second, visible smoothing pass
 * so you can see what post-process AA actually does to thin edges.
 *
 * The RenderNode is built with `RenderNode.createSubclass` (Vite's react plugin
 * can't parse decorator syntax), reads the stage texture via `.glName`, draws a
 * gl_VertexID fullscreen triangle, and calls `resetWebGLState()` after — the
 * same conservative structure as the SceneShader playground.
 */

const OSM_BUILDINGS_URL =
  "https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer";
const OSM_BUILDINGS_ID = "osm-3d-buildings-aa";

/** Zurich old town — dense rooflines against the sky, ideal aliasing content. */
const CAMERA = { position: "8.5417, 47.3655, 650", heading: 20, tilt: 65 };

/** The centre crop, in native CSS pixels, that each tile shows. 3:2, no distortion. */
const CROP_CSS_W = 120;
const CROP_CSS_H = 80;
/** Displayed tile size (also 3:2) — the crop magnified 3× for inspection. */
const TILE_W = 360;
const TILE_H = 240;

const VERT = `#version 300 es
out vec2 vUv;
void main() {
  // One triangle that covers the screen: (-1,-1) (3,-1) (-1,3).
  vec2 pos = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  vUv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

/** The classic reduced FXAA (Timothy Lottes), luma-based, ~35 lines. */
const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uColor;
uniform vec2 uResolution;
in vec2 vUv;
out vec4 fragColor;
const float SPAN_MAX = 8.0;
const float REDUCE_MUL = 1.0 / 8.0;
const float REDUCE_MIN = 1.0 / 128.0;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 inv = 1.0 / uResolution;
  vec3 rgbM = texture(uColor, vUv).rgb;
  vec3 rgbNW = texture(uColor, vUv + vec2(-1.0, -1.0) * inv).rgb;
  vec3 rgbNE = texture(uColor, vUv + vec2( 1.0, -1.0) * inv).rgb;
  vec3 rgbSW = texture(uColor, vUv + vec2(-1.0,  1.0) * inv).rgb;
  vec3 rgbSE = texture(uColor, vUv + vec2( 1.0,  1.0) * inv).rgb;
  float lM = luma(rgbM);
  float lNW = luma(rgbNW), lNE = luma(rgbNE), lSW = luma(rgbSW), lSE = luma(rgbSE);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  // Early-exit where local contrast is low: leave the pixel untouched.
  if (lMax - lMin < lMax * 0.125) { fragColor = vec4(rgbM, 1.0); return; }
  // Blur direction from the luma gradient across the 2x2 corners.
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.25 * REDUCE_MUL, REDUCE_MIN);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
  dir = clamp(dir * rcp, vec2(-SPAN_MAX), vec2(SPAN_MAX)) * inv;
  // 2-tap blend, then a wider 4-tap; keep the 2-tap if the 4-tap overshoots.
  vec3 rgbA = 0.5 * (texture(uColor, vUv + dir * (1.0 / 6.0 - 0.5)).rgb +
                     texture(uColor, vUv + dir * (2.0 / 6.0 - 0.5)).rgb);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (texture(uColor, vUv + dir * -0.5).rgb +
                                   texture(uColor, vUv + dir * 0.5).rgb);
  float lB = luma(rgbB);
  fragColor = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, 1.0);
}`;

/**
 * A post-processing node on `final-color`: reads the finished frame as a
 * texture, runs FXAA into a fresh output framebuffer, and carries the input's
 * depth attachment over (the engine expects matching attachments).
 */
interface FxaaNode extends RenderNode {
  /** Set when shader compilation failed — render then passes frames through. */
  broken: boolean;
  /** Called once if compilation fails so the UI can say so honestly. */
  onBroken: (() => void) | null;
  _program?: WebGLProgram | null;
  _vao?: WebGLVertexArrayObject | null;
  _uColor?: WebGLUniformLocation | null;
  _uResolution?: WebGLUniformLocation | null;
}

const compileProgram = (node: FxaaNode, gl: WebGL2RenderingContext): boolean => {
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
  node._uResolution = gl.getUniformLocation(program, "uResolution");
  return true;
};

function renderFxaa(this: FxaaNode, inputs: ManagedFBO[]): ManagedFBO | null | undefined {
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
  // The input texture is sized to the drawing buffer; FXAA steps in texel units.
  gl.uniform2f(this._uResolution ?? null, gl.drawingBufferWidth, gl.drawingBufferHeight);
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

const FxaaRenderNode = RenderNode.createSubclass({
  declaredClass: "cge.FxaaRenderNode",
  broken: false,
  onBroken: null,
  render: renderFxaa,
}) as unknown as new (props: {
  view: SceneView;
  consumes: ConsumedNodes;
  produces: RenderNodeOutput;
}) => FxaaNode;

/** Load a data URL into an <img> so we can crop it with drawImage. */
const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("screenshot image failed to load"));
    img.src = src;
  });

/** Centre-crop an image and draw it to a tile, magnifying with nearest filtering. */
const tileFromImage = (img: HTMLImageElement, fracW: number, fracH: number): string => {
  const sw = img.width * fracW;
  const sh = img.height * fracH;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  const c = document.createElement("canvas");
  c.width = TILE_W;
  c.height = TILE_H;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.imageSmoothingEnabled = false; // honest jaggies: no free averaging
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, TILE_W, TILE_H);
  return c.toDataURL();
};

/**
 * The supersampled tile: average the 3×-rendered crop DOWN to the native
 * display grid (smoothing on → 9 samples per pixel), then magnify with the same
 * nearest filtering as the other tiles so the comparison is apples-to-apples.
 */
const ssaaTileFromImage = (img: HTMLImageElement, fracW: number, fracH: number): string => {
  const sw = img.width * fracW;
  const sh = img.height * fracH;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  const mid = document.createElement("canvas");
  mid.width = CROP_CSS_W;
  mid.height = CROP_CSS_H;
  const mctx = mid.getContext("2d");
  if (!mctx) return "";
  mctx.imageSmoothingEnabled = true; // this downscale IS the supersampling average
  mctx.imageSmoothingQuality = "high";
  mctx.drawImage(img, sx, sy, sw, sh, 0, 0, CROP_CSS_W, CROP_CSS_H);
  const c = document.createElement("canvas");
  c.width = TILE_W;
  c.height = TILE_H;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mid, 0, 0, TILE_W, TILE_H);
  return c.toDataURL();
};

type Tiles = { low: string; native: string; super: string };

const TILE_LABELS: { key: keyof Tiles; label: string }[] = [
  { key: "low", label: "⅓× nearest" },
  { key: "native", label: "1×" },
  { key: "super", label: "3× downscaled (SSAA)" },
];

export default function AaLab(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const nodeRef = useRef<FxaaNode | null>(null);
  const [fxaa, setFxaa] = useState(false);
  const [broken, setBroken] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [tiles, setTiles] = useState<Tiles | null>(null);

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

  /** (Re)create the FXAA render node on the live view's final-color stage. */
  const createNode = (el: HTMLArcgisSceneElement): void => {
    destroyNode();
    const node = new FxaaRenderNode({
      view: el.view as SceneView,
      consumes: { required: ["final-color"] },
      produces: "final-color",
    });
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
    if (fxaa) createNode(el);
  };

  const handleCapture = async (): Promise<void> => {
    const el = readyScene();
    if (!el) return;
    const view = el.view as SceneView;
    // Show pure resolution effects: drop FXAA during capture, restore it after.
    const restoreFxaa = fxaa && !!nodeRef.current && !nodeRef.current.destroyed;
    if (restoreFxaa) destroyNode();
    setCapturing(true);
    try {
      const w = Math.max(1, Math.round(view.width));
      const h = Math.max(1, Math.round(view.height));
      const lowShot = await view.takeScreenshot({
        width: Math.max(1, Math.round(w / 3)),
        height: Math.max(1, Math.round(h / 3)),
      });
      if (!el.view) return;
      const nativeShot = await view.takeScreenshot({ width: w, height: h });
      if (!el.view) return;
      const superShot = await view.takeScreenshot({ width: w * 3, height: h * 3 });
      if (!el.view) return;
      const [lowImg, nativeImg, superImg] = await Promise.all([
        loadImage(lowShot.dataUrl),
        loadImage(nativeShot.dataUrl),
        loadImage(superShot.dataUrl),
      ]);
      if (!el.view) return;
      const fracW = CROP_CSS_W / w;
      const fracH = CROP_CSS_H / h;
      setTiles({
        low: tileFromImage(lowImg, fracW, fracH),
        native: tileFromImage(nativeImg, fracW, fracH),
        super: ssaaTileFromImage(superImg, fracW, fracH),
      });
    } catch {
      setTiles(null);
    } finally {
      setCapturing(false);
      const live = readyScene();
      if (restoreFxaa && live) createNode(live);
    }
  };

  const baseCaption = broken
    ? "The FXAA shader failed to compile on this GPU — the scene renders untouched. That failure mode is honest too: custom pipeline injection is experimental, expert-level API. Capture still works — it re-renders the scene, no shader needed."
    : fxaa
      ? "FXAA post-pass ON: a second, luma-based reduced FXAA runs after the engine's own anti-aliasing — watch thin roof edges soften slightly. FXAA is a cheap post-process; MSAA supersamples only edge pixels at extra memory cost; TAA reuses samples from past frames and can smear on motion."
      : "FXAA post-pass off — you're seeing the engine's own anti-aliasing. Toggle FXAA for a visible second smoothing pass, or capture the resolution comparison below.";
  const captureCaption =
    " Same frame, three resolutions: at ⅓× the edge staircase is undeniable; the 3×-downscaled tile averages 9 rendered samples per displayed pixel — supersampling, the oldest anti-aliasing there is. All three are real renders (takeScreenshot re-renders — verified).";
  const caption = capturing
    ? "Capturing three renders at ⅓×, 1× and 3×…"
    : baseCaption + (tiles ? captureCaption : "");

  return (
    <PlaygroundFrame
      title="Anti-aliasing lab — resolution and FXAA over Zurich"
      caption={caption}
      onReset={() => {
        setFxaa(false);
        setBroken(false);
        setTiles(null);
        destroyNode();
      }}
      controls={
        <>
          <calcite-button
            width="full"
            scale="s"
            icon-start="image"
            loading={capturing || undefined}
            disabled={capturing || undefined}
            onClick={() => void handleCapture()}
          >
            Capture comparison
          </calcite-button>
          <SwitchControl
            label="FXAA post-pass"
            checked={fxaa}
            onChange={(on) => {
              setFxaa(on);
              const el = readyScene();
              if (!el) return;
              if (on) createNode(el);
              else destroyNode();
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Anti-aliasing removes the jagged staircase where a hard edge meets the pixel grid.
            Supersampling (the capture button) renders more samples than it displays and averages
            them down — expensive but exact. FXAA is the opposite trade: one cheap post-process pass
            that finds high-contrast edges in the finished frame and blurs along them. The engine
            already anti-aliases; this FXAA is a second, deliberately visible pass so you can see
            what post-process AA costs a thin line in sharpness.
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
      {tiles && (
        <div className="absolute inset-x-0 bottom-0 border-t border-[var(--calcite-color-border-2)] bg-[var(--calcite-color-foreground-1)] p-2 shadow-lg">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--calcite-color-text-1)]">
              Same centre crop, three render resolutions
            </span>
            <calcite-button
              appearance="transparent"
              kind="neutral"
              scale="s"
              icon-start="x"
              aria-label="Close comparison"
              onClick={() => setTiles(null)}
            />
          </div>
          <div className="flex gap-2">
            {TILE_LABELS.map(({ key, label }) => (
              <figure key={key} className="m-0 flex min-w-0 flex-1 flex-col gap-1">
                <img
                  src={tiles[key]}
                  width={TILE_W}
                  height={TILE_H}
                  alt={`Zurich rooflines, ${label}`}
                  className="h-auto w-full rounded border border-[var(--calcite-color-border-3)]"
                />
                <figcaption className="text-center text-[10px] tabular-nums text-[var(--calcite-color-text-2)]">
                  {label}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
    </PlaygroundFrame>
  );
}
