import { useEffect, useRef, useState } from "react";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SegmentedControl } from "../../components/controls";

/**
 * Ray casting vs ray tracing, top-down. A camera dot sweeps a fan of rays
 * through a 2D room with solid boxes, a mirror and a tinted-glass block.
 * Cast mode stops every ray at its first hit and paints those hits into a 1D
 * strip — exactly how Wolfenstein 3D drew walls. Trace mode lets rays bounce
 * off the mirror and bend through the glass, gathering color recursively.
 */

type Mode = "cast" | "trace";

interface DemoState {
  mode: Mode;
  angleDeg: number;
  rayCount: number;
  maxBounces: number;
}

const INITIAL: DemoState = {
  mode: "cast",
  angleDeg: 10,
  rayCount: 64,
  maxBounces: 3,
};

interface Vec2 {
  x: number;
  y: number;
}

type Material = "wall" | "mirror" | "glass" | "solid";

interface Segment {
  a: Vec2;
  b: Vec2;
  material: Material;
  /** Linear RGB 0..1 — surface color (solids/walls), tint (glass), base sheen (mirror). */
  color: [number, number, number];
}

const INITIAL_CAMERA: Vec2 = { x: 0.26, y: 0.46 };
const FOV = Math.PI / 3; // 60° view fan
const STRIP_H = 44; // px — the 1D "rendered view" along the bottom
const STRIP_GAP = 22; // px — room for the strip label
const CAMERA_HIT_RADIUS = 16;
const MAX_DIST = 1.5; // normalized — distance shading reference
const EPS = 1e-4;

const COLOR_BG = "#14181f";
const COLOR_RAY = "rgba(253, 224, 71, 0.5)";
const COLOR_CAMERA = "#f59e0b";

const WALL_COLOR: [number, number, number] = [0.52, 0.57, 0.64];
const MIRROR_COLOR: [number, number, number] = [0.75, 0.88, 0.95];
const GLASS_TINT: [number, number, number] = [0.6, 0.92, 0.95];
const RED_BOX: [number, number, number] = [0.93, 0.32, 0.3];
const GREEN_BOX: [number, number, number] = [0.35, 0.82, 0.45];

/** Axis-aligned box → four segments of one material/color. */
function boxSegments(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  material: Material,
  color: [number, number, number],
): Segment[] {
  const p = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  return p.map((a, i) => ({ a, b: p[(i + 1) % 4], material, color }));
}

/** Scene in normalized 0..1 coordinates (y down, like the canvas). */
const SCENE: readonly Segment[] = [
  ...boxSegments(0.02, 0.03, 0.98, 0.97, "wall", WALL_COLOR),
  // Mirror: a single slanted segment in the upper right.
  { a: { x: 0.66, y: 0.06 }, b: { x: 0.96, y: 0.32 }, material: "mirror", color: MIRROR_COLOR },
  // Tinted glass block.
  ...boxSegments(0.52, 0.6, 0.74, 0.82, "glass", GLASS_TINT),
  // Two solid colored boxes.
  ...boxSegments(0.42, 0.1, 0.6, 0.28, "solid", RED_BOX),
  ...boxSegments(0.08, 0.62, 0.26, 0.82, "solid", GREEN_BOX),
];

const GLASS_RECT = { x0: 0.52, y0: 0.6, x1: 0.74, y1: 0.82 };
const RED_RECT = { x0: 0.42, y0: 0.1, x1: 0.6, y1: 0.28 };
const GREEN_RECT = { x0: 0.08, y0: 0.62, x1: 0.26, y1: 0.82 };

interface Hit {
  t: number;
  point: Vec2;
  /** Unit normal oriented against the incoming ray. */
  normal: Vec2;
  seg: Segment;
}

/** Closest ray/segment intersection in the scene, or null. */
function intersectScene(origin: Vec2, dir: Vec2): Hit | null {
  let best: Hit | null = null;
  for (const seg of SCENE) {
    const ex = seg.b.x - seg.a.x;
    const ey = seg.b.y - seg.a.y;
    const denom = dir.x * ey - dir.y * ex;
    if (Math.abs(denom) < 1e-12) continue;
    const dx = seg.a.x - origin.x;
    const dy = seg.a.y - origin.y;
    const t = (dx * ey - dy * ex) / denom;
    const u = (dx * dir.y - dy * dir.x) / denom;
    if (t <= EPS || u < 0 || u > 1) continue;
    if (best && t >= best.t) continue;
    const len = Math.hypot(ex, ey);
    let nx = ey / len;
    let ny = -ex / len;
    if (nx * dir.x + ny * dir.y > 0) {
      nx = -nx;
      ny = -ny;
    }
    best = {
      t,
      point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t },
      normal: { x: nx, y: ny },
      seg,
    };
  }
  return best;
}

function shade(color: readonly [number, number, number], dist: number): [number, number, number] {
  const f = Math.max(0.25, 1 - dist / MAX_DIST);
  return [color[0] * f, color[1] * f, color[2] * f];
}

interface PathSegment {
  a: Vec2;
  b: Vec2;
  depth: number;
}

interface TraceResult {
  segments: PathSegment[];
  color: [number, number, number];
}

/**
 * Follow one ray. In cast mode (recurse = false) it stops at the first hit.
 * In trace mode mirrors reflect and glass bends ("refract-ish") and tints,
 * up to maxBounces secondary segments — recursive light transport in 2D.
 */
function traceRay(origin: Vec2, dir: Vec2, recurse: boolean, maxBounces: number): TraceResult {
  const segments: PathSegment[] = [];
  let pos = origin;
  let d = dir;
  let tint: [number, number, number] = [1, 1, 1];
  let traveled = 0;
  for (let depth = 0; ; depth++) {
    const hit = intersectScene(pos, d);
    if (!hit) {
      segments.push({ a: pos, b: { x: pos.x + d.x * 2, y: pos.y + d.y * 2 }, depth });
      return { segments, color: [0, 0, 0] };
    }
    segments.push({ a: pos, b: hit.point, depth });
    traveled += hit.t;
    const m = hit.seg.material;
    const stop = !recurse || depth >= maxBounces || m === "wall" || m === "solid";
    if (stop) {
      const base = shade(hit.seg.color, traveled);
      return {
        segments,
        color: [base[0] * tint[0], base[1] * tint[1], base[2] * tint[2]],
      };
    }
    if (m === "mirror") {
      const dot = d.x * hit.normal.x + d.y * hit.normal.y;
      d = { x: d.x - 2 * dot * hit.normal.x, y: d.y - 2 * dot * hit.normal.y };
      tint = [tint[0] * 0.85, tint[1] * 0.88, tint[2] * 0.9]; // mirrors lose a little energy
    } else {
      // Glass: bend the ray toward the surface (a cheap stand-in for Snell's
      // law) and multiply in the tint — once entering, once leaving.
      const bx = d.x - hit.normal.x * 0.35;
      const by = d.y - hit.normal.y * 0.35;
      const len = Math.hypot(bx, by);
      d = { x: bx / len, y: by / len };
      tint = [tint[0] * GLASS_TINT[0], tint[1] * GLASS_TINT[1], tint[2] * GLASS_TINT[2]];
    }
    pos = { x: hit.point.x + d.x * EPS * 4, y: hit.point.y + d.y * EPS * 4 };
  }
}

function css(color: readonly [number, number, number]): string {
  return `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export default function RayLab(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<DemoState>({ ...INITIAL });
  const cameraRef = useRef<Vec2>({ ...INITIAL_CAMERA });
  const apiRef = useRef<{ draw: () => void } | null>(null);
  const [state, setState] = useState<DemoState>({ ...INITIAL });

  // Mirror state into a ref so drawing reads fresh values, then redraw.
  useEffect(() => {
    stateRef.current = state;
    apiRef.current?.draw();
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas not supported");

    let dragging = false;

    const draw = (): void => {
      const s = stateRef.current;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pw = Math.round(w * dpr);
      const ph = Math.round(h * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = COLOR_BG;
      ctx.fillRect(0, 0, w, h);

      // Scene occupies the area above the rendered strip, mapped to a
      // centered square so reflection angles draw true (no anisotropic
      // stretch between the traced and the displayed geometry).
      const sceneH = h - STRIP_H - STRIP_GAP;
      const side = Math.min(w, sceneH);
      const offX = (w - side) / 2;
      const offY = (sceneH - side) / 2;
      const sx = (x: number): number => offX + x * side;
      const sy = (y: number): number => offY + y * side;

      // Filled shapes first (rays and outlines go on top).
      const fillRect = (r: { x0: number; y0: number; x1: number; y1: number }): void => {
        ctx.fillRect(sx(r.x0), sy(r.y0), (r.x1 - r.x0) * side, (r.y1 - r.y0) * side);
      };
      ctx.fillStyle = "rgba(96, 165, 250, 0.14)";
      fillRect(GLASS_RECT);
      ctx.fillStyle = "rgba(239, 68, 68, 0.55)";
      fillRect(RED_RECT);
      ctx.fillStyle = "rgba(34, 197, 94, 0.5)";
      fillRect(GREEN_RECT);

      // Cast/trace the fan and remember strip colors.
      const cam = cameraRef.current;
      const center = (s.angleDeg * Math.PI) / 180;
      const stripColors: [number, number, number][] = [];
      ctx.lineWidth = 1;
      for (let i = 0; i < s.rayCount; i++) {
        const f = s.rayCount === 1 ? 0.5 : i / (s.rayCount - 1);
        const a = center - FOV / 2 + FOV * f;
        const dir = { x: Math.cos(a), y: Math.sin(a) };
        const result = traceRay(cam, dir, s.mode === "trace", s.maxBounces);
        stripColors.push(result.color);
        for (const seg of result.segments) {
          // Bounce segments get dimmer with depth — energy fading per bounce.
          ctx.strokeStyle = COLOR_RAY;
          ctx.globalAlpha = Math.max(0.1, 0.55 * Math.pow(0.55, seg.depth));
          ctx.beginPath();
          ctx.moveTo(sx(seg.a.x), sy(seg.a.y));
          ctx.lineTo(sx(seg.b.x), sy(seg.b.y));
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // Segment outlines on top of the rays so materials stay identifiable.
      for (const seg of SCENE) {
        ctx.strokeStyle =
          seg.material === "mirror"
            ? "#bae6fd"
            : seg.material === "glass"
              ? "rgba(125, 211, 252, 0.9)"
              : css(seg.color);
        ctx.lineWidth = seg.material === "mirror" ? 5 : 2.5;
        ctx.beginPath();
        ctx.moveTo(sx(seg.a.x), sy(seg.a.y));
        ctx.lineTo(sx(seg.b.x), sy(seg.b.y));
        ctx.stroke();
      }

      // Labels for the special materials.
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillStyle = "rgba(226, 232, 240, 0.75)";
      ctx.textAlign = "center";
      ctx.fillText("mirror", sx(0.85), sy(0.13));
      ctx.fillText("glass", sx(0.63), sy(0.715));

      // Camera dot (draggable).
      ctx.fillStyle = "rgba(245, 158, 11, 0.25)";
      ctx.beginPath();
      ctx.arc(sx(cam.x), sy(cam.y), CAMERA_HIT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLOR_CAMERA;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx(cam.x), sy(cam.y), 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // The 1D rendered strip: one column per ray, Wolfenstein-style.
      ctx.fillStyle = "rgba(226, 232, 240, 0.6)";
      ctx.textAlign = "left";
      ctx.fillText("what the camera sees (one column per ray)", 8, h - STRIP_H - 7);
      const colW = w / s.rayCount;
      for (let i = 0; i < s.rayCount; i++) {
        ctx.fillStyle = css(stripColors[i]);
        ctx.fillRect(i * colW, h - STRIP_H, colW + 1, STRIP_H);
      }
    };

    apiRef.current = { draw };

    /** Inverse of the draw mapping: pointer pixels → normalized scene coords. */
    const sceneMapping = (): { side: number; offX: number; offY: number } => {
      const sceneH = canvas.clientHeight - STRIP_H - STRIP_GAP;
      const side = Math.min(canvas.clientWidth, sceneH);
      return { side, offX: (canvas.clientWidth - side) / 2, offY: (sceneH - side) / 2 };
    };

    const getPos = (e: PointerEvent): Vec2 => {
      const rect = canvas.getBoundingClientRect();
      const m = sceneMapping();
      return {
        x: (e.clientX - rect.left - m.offX) / m.side,
        y: (e.clientY - rect.top - m.offY) / m.side,
      };
    };

    const hitsCamera = (p: Vec2): boolean => {
      const m = sceneMapping();
      const cam = cameraRef.current;
      return Math.hypot((cam.x - p.x) * m.side, (cam.y - p.y) * m.side) <= CAMERA_HIT_RADIUS;
    };

    const onPointerDown = (e: PointerEvent): void => {
      if (!hitsCamera(getPos(e))) return;
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent): void => {
      const p = getPos(e);
      if (!dragging) {
        canvas.style.cursor = hitsCamera(p) ? "grab" : "default";
        return;
      }
      cameraRef.current = { x: clamp(p.x, 0.05, 0.95), y: clamp(p.y, 0.06, 0.94) };
      canvas.style.cursor = "grabbing";
      draw();
    };

    const endDrag = (): void => {
      dragging = false;
      canvas.style.cursor = "default";
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    const resizeObserver = new ResizeObserver(() => draw());
    resizeObserver.observe(canvas);
    draw();

    return () => {
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endDrag);
      canvas.removeEventListener("pointercancel", endDrag);
      apiRef.current = null;
    };
  }, []);

  const caption =
    state.mode === "cast"
      ? `Ray casting: ${state.rayCount} rays leave the camera and stop at their first hit. The strip below paints those hits column by column — the whole Wolfenstein 3D rendering trick. Drag the orange camera around.`
      : state.maxBounces === 0
        ? "Ray tracing with 0 bounces is just ray casting — raise “Max bounces” to let rays reflect off the mirror and bend through the glass."
        : `Ray tracing: rays now recurse — they reflect off the mirror and bend (and tint) through the glass, up to ${state.maxBounces} bounce${state.maxBounces === 1 ? "" : "s"}. Dimmer segments are deeper bounces; the strip gathers color along the whole path.`;

  const handleReset = (): void => {
    cameraRef.current = { ...INITIAL_CAMERA };
    setState({ ...INITIAL });
    apiRef.current?.draw();
  };

  return (
    <PlaygroundFrame
      title="Ray casting vs ray tracing"
      caption={caption}
      onReset={handleReset}
      controls={
        <>
          <SegmentedControl<Mode>
            label="Mode"
            value={state.mode}
            options={[
              { value: "cast", label: "Cast" },
              { value: "trace", label: "Trace" },
            ]}
            onChange={(mode) => setState((s) => ({ ...s, mode }))}
          />
          <SliderControl
            label="Camera angle"
            value={state.angleDeg}
            min={0}
            max={360}
            onInput={(angleDeg) => setState((s) => ({ ...s, angleDeg }))}
            format={(v) => `${v}°`}
          />
          <SliderControl
            label="Ray count"
            value={state.rayCount}
            min={16}
            max={160}
            onInput={(rayCount) => setState((s) => ({ ...s, rayCount }))}
          />
          {state.mode === "trace" && (
            <SliderControl
              label="Max bounces"
              value={state.maxBounces}
              min={0}
              max={5}
              onInput={(maxBounces) => setState((s) => ({ ...s, maxBounces }))}
            />
          )}
        </>
      }
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none"
        aria-label="Top-down ray casting and ray tracing demo: drag the camera, rays fan out into a 2D room"
      />
    </PlaygroundFrame>
  );
}
