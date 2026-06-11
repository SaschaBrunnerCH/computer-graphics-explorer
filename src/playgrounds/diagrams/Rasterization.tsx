import { useEffect, useRef, useState } from "react";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";

/**
 * How a triangle becomes pixels: a CPU rasterizer drawn on a plain 2D canvas.
 * Every grid cell asks one question — is my sample point (pixel center)
 * inside the triangle? Cells that answer yes get filled, the mathematically
 * exact outline is drawn on top, and the staircase mismatch between the two
 * is the whole lesson. Raising the resolution or turning on 2×2 coverage
 * sampling shows that anti-aliasing is nothing more than asking the question
 * with more samples.
 */

interface Vec2 {
  x: number;
  y: number;
}

interface DemoState {
  cols: number;
  showSamples: boolean;
  showCoverage: boolean;
  animate: boolean;
}

const INITIAL: DemoState = {
  cols: 24,
  showSamples: true,
  showCoverage: false,
  animate: false,
};

/** Triangle vertices in normalized stage coordinates (0..1 of width/height). */
const INITIAL_TRI: readonly Vec2[] = [
  { x: 0.2, y: 0.82 },
  { x: 0.48, y: 0.12 },
  { x: 0.86, y: 0.66 },
];

const HIT_RADIUS = 14; // px — pointer distance within which a vertex grabs
const HANDLE_RADIUS = 8;
const ROTATION_SPEED = 0.35; // rad/s when "Animate" is on
const VERTEX_MARGIN = 0.02; // keep dragged vertices just inside the stage

// Fixed canvas palette (readable in both light and dark app themes).
const COLOR_BG = "#14181f";
const COLOR_GRID = "rgba(148, 163, 184, 0.18)";
const COLOR_FILL = "56, 189, 248"; // sky blue, alpha applied per cell
const FILL_ALPHA = 0.55;
const COLOR_DOT_IN = "#bae6fd";
const COLOR_DOT_OUT = "rgba(148, 163, 184, 0.4)";
const COLOR_OUTLINE = "#fbbf24";
const COLOR_HANDLE = "#f59e0b";
const COLOR_HANDLE_RING = "#ffffff";
const COLOR_COVERAGE_TEXT = "rgba(255, 255, 255, 0.85)";

/**
 * Edge function (half-space test) — the actual hardware rasterization rule.
 * E(p) = (b − a) × (p − a); its sign says which side of edge ab the point
 * lies on, and a point is inside the triangle when all three edge functions
 * share the triangle's winding sign.
 */
function edgeFunction(a: Vec2, b: Vec2, px: number, py: number): number {
  return (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export default function Rasterization(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<DemoState>({ ...INITIAL });
  const triRef = useRef<Vec2[]>(INITIAL_TRI.map((v) => ({ ...v })));
  const apiRef = useRef<{ draw: () => void; ensureLoop: () => void } | null>(null);
  const [state, setState] = useState<DemoState>({ ...INITIAL });

  // Mirror state into a ref so the draw/RAF code reads fresh values without
  // re-running the canvas setup effect; then redraw (or restart the loop).
  useEffect(() => {
    stateRef.current = state;
    const api = apiRef.current;
    if (!api) return;
    if (state.animate) api.ensureLoop();
    else api.draw();
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas not supported");

    let raf = 0;
    let running = false;
    let lastTime = 0;
    let dragIndex = -1;

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

      const cols = s.cols;
      const rows = Math.max(4, Math.round((cols * h) / w)); // rows follow the aspect ratio
      const cw = w / cols;
      const ch = h / rows;

      const tri = triRef.current.map((v) => ({ x: v.x * w, y: v.y * h }));
      const [v0, v1, v2] = tri;
      // Winding sign so the inside test works for both CW and CCW triangles.
      const sign = edgeFunction(v0, v1, v2.x, v2.y) >= 0 ? 1 : -1;
      const inside = (px: number, py: number): boolean =>
        edgeFunction(v0, v1, px, py) * sign >= 0 &&
        edgeFunction(v1, v2, px, py) * sign >= 0 &&
        edgeFunction(v2, v0, px, py) * sign >= 0;

      // 1) Cell fills — one center sample, or 2×2 sub-samples in coverage mode.
      const showText = s.showCoverage && cw >= 34 && ch >= 22;
      if (showText) {
        ctx.font = "10px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
      }
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * cw;
          const y = r * ch;
          const cx = x + cw / 2;
          const cy = y + ch / 2;
          if (s.showCoverage) {
            // 2×2 supersampling: estimate how much of the cell the triangle
            // covers, then shade proportionally — MSAA in miniature.
            let hits = 0;
            for (const ox of [-0.25, 0.25]) {
              for (const oy of [-0.25, 0.25]) {
                if (inside(cx + ox * cw, cy + oy * ch)) hits++;
              }
            }
            if (hits > 0) {
              const coverage = hits / 4;
              ctx.fillStyle = `rgba(${COLOR_FILL}, ${(FILL_ALPHA * coverage).toFixed(3)})`;
              ctx.fillRect(x, y, cw, ch);
              if (showText && coverage < 1) {
                ctx.fillStyle = COLOR_COVERAGE_TEXT;
                ctx.fillText(`${coverage * 100}%`, cx, cy);
              }
            }
          } else if (inside(cx, cy)) {
            ctx.fillStyle = `rgba(${COLOR_FILL}, ${FILL_ALPHA})`;
            ctx.fillRect(x, y, cw, ch);
          }
        }
      }

      // 2) Grid lines.
      ctx.strokeStyle = COLOR_GRID;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 1; c < cols; c++) {
        const x = Math.round(c * cw) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let r = 1; r < rows; r++) {
        const y = Math.round(r * ch) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      // 3) Sample points (pixel centers).
      if (s.showSamples) {
        const dotR = Math.min(2.5, cw * 0.12);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const cx = (c + 0.5) * cw;
            const cy = (r + 0.5) * ch;
            ctx.fillStyle = inside(cx, cy) ? COLOR_DOT_IN : COLOR_DOT_OUT;
            ctx.beginPath();
            ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // 4) The true mathematical triangle outline, on top of the blocky fill.
      ctx.strokeStyle = COLOR_OUTLINE;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(v0.x, v0.y);
      ctx.lineTo(v1.x, v1.y);
      ctx.lineTo(v2.x, v2.y);
      ctx.closePath();
      ctx.stroke();

      // 5) Draggable vertex handles (halo hints at the grab area).
      for (const v of tri) {
        ctx.fillStyle = "rgba(245, 158, 11, 0.25)";
        ctx.beginPath();
        ctx.arc(v.x, v.y, HIT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COLOR_HANDLE;
        ctx.strokeStyle = COLOR_HANDLE_RING;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(v.x, v.y, HANDLE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    };

    const rotateTriangle = (dt: number): void => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      const pts = triRef.current.map((v) => ({ x: v.x * w, y: v.y * h }));
      const cx = (pts[0].x + pts[1].x + pts[2].x) / 3;
      const cy = (pts[0].y + pts[1].y + pts[2].y) / 3;
      const a = ROTATION_SPEED * dt;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      triRef.current = pts.map((p) => {
        const dx = p.x - cx;
        const dy = p.y - cy;
        return { x: (cx + dx * cos - dy * sin) / w, y: (cy + dx * sin + dy * cos) / h };
      });
    };

    const tick = (now: number): void => {
      const s = stateRef.current;
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      // Dragging pauses the rotation so the pointer always wins.
      if (s.animate && dragIndex === -1) rotateTriangle(dt);
      draw();
      if (s.animate || dragIndex !== -1) {
        raf = requestAnimationFrame(tick);
      } else {
        running = false;
      }
    };

    const ensureLoop = (): void => {
      if (running) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(tick);
    };

    apiRef.current = { draw, ensureLoop };

    const getPos = (e: PointerEvent): Vec2 => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const hitVertex = (p: Vec2): number => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      return triRef.current.findIndex(
        (v) => Math.hypot(v.x * w - p.x, v.y * h - p.y) <= HIT_RADIUS,
      );
    };

    const onPointerDown = (e: PointerEvent): void => {
      const idx = hitVertex(getPos(e));
      if (idx === -1) return;
      dragIndex = idx;
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      ensureLoop(); // redraw via RAF while the drag lasts
    };

    const onPointerMove = (e: PointerEvent): void => {
      const p = getPos(e);
      if (dragIndex === -1) {
        canvas.style.cursor = hitVertex(p) === -1 ? "default" : "grab";
        return;
      }
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      triRef.current[dragIndex] = {
        x: clamp(p.x / w, VERTEX_MARGIN, 1 - VERTEX_MARGIN),
        y: clamp(p.y / h, VERTEX_MARGIN, 1 - VERTEX_MARGIN),
      };
      canvas.style.cursor = "grabbing";
    };

    const endDrag = (): void => {
      dragIndex = -1;
      canvas.style.cursor = "default";
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    const resizeObserver = new ResizeObserver(() => draw());
    resizeObserver.observe(canvas);

    if (stateRef.current.animate) ensureLoop();
    else draw();

    return () => {
      cancelAnimationFrame(raf);
      running = false;
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endDrag);
      canvas.removeEventListener("pointercancel", endDrag);
      apiRef.current = null;
    };
  }, []);

  const caption = state.showCoverage
    ? "Boundary cells now take four sub-samples (2×2) and shade by how many landed inside — partial transparency at the edges is exactly the idea behind MSAA."
    : state.cols >= 48
      ? `${state.cols} columns: with this many samples the blocky shape almost converges to the true triangle — anti-aliasing is simply more samples.`
      : state.cols <= 12
        ? "Giant pixels: each center is either inside or outside, no in-between — that hard yes/no is where the staircase comes from."
        : state.animate
          ? "The triangle rotates but the grid never moves — pixels are fixed in place; only their inside/outside answers change. Drag a corner to take over."
          : "Each cell asks one question: is my center inside the triangle? Drag a corner and watch cells flip.";

  const handleReset = (): void => {
    triRef.current = INITIAL_TRI.map((v) => ({ ...v }));
    setState({ ...INITIAL });
    apiRef.current?.draw();
  };

  return (
    <PlaygroundFrame
      title="How a triangle becomes pixels"
      caption={caption}
      onReset={handleReset}
      controls={
        <>
          <SliderControl
            label="Grid resolution"
            value={state.cols}
            min={8}
            max={64}
            onInput={(cols) => setState((s) => ({ ...s, cols }))}
            format={(v) => `${v} cols`}
          />
          <SwitchControl
            label="Show sample points"
            checked={state.showSamples}
            onChange={(showSamples) => setState((s) => ({ ...s, showSamples }))}
          />
          <SwitchControl
            label="Show coverage %"
            checked={state.showCoverage}
            onChange={(showCoverage) => setState((s) => ({ ...s, showCoverage }))}
          />
          <SwitchControl
            label="Animate"
            checked={state.animate}
            onChange={(animate) => setState((s) => ({ ...s, animate }))}
          />
        </>
      }
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none"
        aria-label="Interactive rasterization demo: drag the triangle corners over a pixel grid"
      />
    </PlaygroundFrame>
  );
}
