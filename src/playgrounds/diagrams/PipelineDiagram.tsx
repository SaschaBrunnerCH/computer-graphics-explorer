import { useEffect, useRef, useState } from "react";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";

import "@esri/calcite-components/components/calcite-button";

/**
 * The GPU pipeline as an animated diagram. One triangle at a time travels
 * through four stage boxes — vertex shader → rasterizer → fragment shader →
 * framebuffer — and each box shows what that stage actually does to it:
 * vertices being transformed, coverage cells filling on a pixel grid,
 * fragments getting colored, and finally the persistent mini-framebuffer
 * accumulating the picture triangle by triangle. Hovering a box explains the
 * stage (and whether it is programmable or fixed-function).
 */

interface Vec2 {
  x: number;
  y: number;
}

interface SceneTri {
  pts: [Vec2, Vec2, Vec2];
  color: string;
}

interface DemoState {
  autoPlay: boolean;
  speed: number;
  labels: boolean;
}

const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const INITIAL: DemoState = {
  autoPlay: !prefersReducedMotion,
  speed: 1,
  labels: true,
};

/** The little picture the pipeline builds, in framebuffer space (0..1, y down). */
const SCENE: readonly SceneTri[] = [
  {
    pts: [
      { x: 0.3, y: 0.58 },
      { x: 0.7, y: 0.58 },
      { x: 0.7, y: 0.92 },
    ],
    color: "#d9b38c",
  },
  {
    pts: [
      { x: 0.3, y: 0.58 },
      { x: 0.7, y: 0.92 },
      { x: 0.3, y: 0.92 },
    ],
    color: "#c79c72",
  },
  {
    pts: [
      { x: 0.24, y: 0.58 },
      { x: 0.5, y: 0.28 },
      { x: 0.76, y: 0.58 },
    ],
    color: "#d4554a",
  },
  {
    pts: [
      { x: 0.11, y: 0.92 },
      { x: 0.17, y: 0.92 },
      { x: 0.14, y: 0.66 },
    ],
    color: "#8a6643",
  },
  {
    pts: [
      { x: 0.03, y: 0.72 },
      { x: 0.14, y: 0.4 },
      { x: 0.25, y: 0.72 },
    ],
    color: "#4e9e5f",
  },
  {
    pts: [
      { x: 0.8, y: 0.1 },
      { x: 0.93, y: 0.27 },
      { x: 0.69, y: 0.28 },
    ],
    color: "#f7c948",
  },
];

const HOLD_STAGE = 4; // pseudo-stage: finished image is held before the loop restarts
const STAGE_SECONDS = 1.4; // base duration of one stage at speed ×1
const GRID_COLS = 9;
const GRID_ROWS = 7;
const FB_W = 96;
const FB_H = 72;

const COLOR_BG = "#0e1219";
const COLOR_SKY = "#27405e"; // framebuffer clear color (the picture's sky)
const COLOR_BOX = "#161c26";
const COLOR_BOX_BORDER = "rgba(148, 163, 184, 0.4)";
const COLOR_ACTIVE = "#38bdf8";
const COLOR_HOVER = "#f59e0b";
const COLOR_TEXT = "rgba(226, 232, 240, 0.85)";
const COLOR_TEXT_DIM = "rgba(148, 163, 184, 0.8)";
const COLOR_ARROW = "rgba(148, 163, 184, 0.7)";
const COLOR_GRID = "rgba(148, 163, 184, 0.22)";
const COLOR_COVERAGE = "rgba(159, 179, 200, 0.55)";
const COLOR_PROGRAMMABLE = "#7dd3fc";
const COLOR_FIXED = "rgba(148, 163, 184, 0.9)";

const STAGES = [
  {
    name: "Vertex shader",
    kind: "programmable",
    hover:
      "Vertex shader — programmable: your code runs once per vertex, transforming model-space positions into screen space. No pixels exist yet, only points.",
    active: (n: string): string =>
      `${n} — vertex shader (programmable): its 3 vertices are being transformed from model space into their final screen positions.`,
  },
  {
    name: "Rasterizer",
    kind: "fixed-function",
    hover:
      "Rasterizer — fixed-function: dedicated hardware finds which pixel centers the triangle covers and emits one fragment per covered cell. Configurable, never programmable.",
    active: (n: string): string =>
      `${n} — rasterizer (fixed-function): hardware scans the pixel grid and marks every cell whose center the triangle covers.`,
  },
  {
    name: "Fragment shader",
    kind: "programmable",
    hover:
      "Fragment shader — programmable: your code runs once per fragment (covered pixel) and outputs its color. Texturing and lighting happen here.",
    active: (n: string): string =>
      `${n} — fragment shader (programmable): each covered fragment is shaded with the triangle's color, one tiny program run per pixel.`,
  },
  {
    name: "Framebuffer",
    kind: "fixed-function",
    hover:
      "Output merging — fixed-function: each fragment is depth-tested against what's already in the framebuffer and, if it survives, written (or blended) into the final image.",
    active: (n: string): string =>
      `${n} — output merging (fixed-function): fragments that pass the depth test land in the framebuffer, joining the triangles already drawn.`,
  },
] as const;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function edgeFunction(a: Vec2, b: Vec2, px: number, py: number): number {
  return (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** Map a scene triangle into a stage box's content rect (zoomed to fit, centered). */
function mapTriToRect(tri: SceneTri, r: Rect): [Vec2, Vec2, Vec2] {
  const xs = tri.pts.map((p) => p.x);
  const ys = tri.pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min(r.w / Math.max(maxX - minX, 1e-6), r.h / Math.max(maxY - minY, 1e-6));
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const mx = (minX + maxX) / 2;
  const my = (minY + maxY) / 2;
  return tri.pts.map((p) => ({ x: cx + (p.x - mx) * scale, y: cy + (p.y - my) * scale })) as [
    Vec2,
    Vec2,
    Vec2,
  ];
}

/** Grid cells (row-major) whose center sample lies inside the mapped triangle. */
function coveredCells(pts: [Vec2, Vec2, Vec2], r: Rect): Rect[] {
  const [v0, v1, v2] = pts;
  const sign = edgeFunction(v0, v1, v2.x, v2.y) >= 0 ? 1 : -1;
  const cw = r.w / GRID_COLS;
  const ch = r.h / GRID_ROWS;
  const cells: Rect[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const x = r.x + col * cw;
      const y = r.y + row * ch;
      const px = x + cw / 2;
      const py = y + ch / 2;
      if (
        edgeFunction(v0, v1, px, py) * sign >= 0 &&
        edgeFunction(v1, v2, px, py) * sign >= 0 &&
        edgeFunction(v2, v0, px, py) * sign >= 0
      ) {
        cells.push({ x, y, w: cw, h: ch });
      }
    }
  }
  return cells;
}

export default function PipelineDiagram(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<DemoState>({ ...INITIAL });
  const animRef = useRef({ tri: 0, stage: 0, t: 0 });
  const steppingRef = useRef(false);
  const hoverRef = useRef<number | null>(null);
  const apiRef = useRef<{ clearFb: () => void } | null>(null);
  const [state, setState] = useState<DemoState>({ ...INITIAL });
  const [info, setInfo] = useState({ tri: 0, stage: 0 });
  const [hovered, setHovered] = useState<number | null>(null);

  // Mirror state into refs so the RAF loop reads fresh values without re-running setup.
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    hoverRef.current = hovered;
  }, [hovered]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas not supported");

    // Persistent mini-framebuffer the last stage accumulates into.
    const fb = document.createElement("canvas");
    fb.width = FB_W;
    fb.height = FB_H;
    const fbCtx = fb.getContext("2d");
    if (!fbCtx) throw new Error("2D canvas not supported");
    const clearFb = (): void => {
      fbCtx.fillStyle = COLOR_SKY;
      fbCtx.fillRect(0, 0, FB_W, FB_H);
    };
    clearFb();
    apiRef.current = { clearFb };

    const fbTriPath = (c: CanvasRenderingContext2D, tri: SceneTri, r: Rect): void => {
      c.beginPath();
      c.moveTo(r.x + tri.pts[0].x * r.w, r.y + tri.pts[0].y * r.h);
      c.lineTo(r.x + tri.pts[1].x * r.w, r.y + tri.pts[1].y * r.h);
      c.lineTo(r.x + tri.pts[2].x * r.w, r.y + tri.pts[2].y * r.h);
      c.closePath();
    };

    const composite = (tri: SceneTri): void => {
      fbCtx.fillStyle = tri.color;
      fbTriPath(fbCtx, tri, { x: 0, y: 0, w: FB_W, h: FB_H });
      fbCtx.fill();
    };

    let raf = 0;
    let lastNow = performance.now();
    let boxRects: Rect[] = [];
    let publishedTri = -1;
    let publishedStage = -1;

    /** One stage hand-off: advance the active triangle to the next stage. */
    const handOff = (): void => {
      const a = animRef.current;
      if (a.stage < 3) {
        a.stage += 1;
      } else if (a.stage === 3) {
        composite(SCENE[a.tri]);
        if (a.tri + 1 >= SCENE.length) {
          a.stage = HOLD_STAGE;
        } else {
          a.tri += 1;
          a.stage = 0;
        }
      } else {
        // hold finished → clear and start the next "frame"
        clearFb();
        a.tri = 0;
        a.stage = 0;
      }
    };

    const drawStageVertex = (tri: SceneTri, content: Rect, t: number): void => {
      const target = mapTriToRect(tri, content);
      const cx = (target[0].x + target[1].x + target[2].x) / 3;
      const cy = (target[0].y + target[1].y + target[2].y) / 3;
      // "Model space" start: same triangle rotated and shrunk about its centroid.
      const cos = Math.cos(-1.1);
      const sin = Math.sin(-1.1);
      const start = target.map((p) => {
        const dx = (p.x - cx) * 0.55;
        const dy = (p.y - cy) * 0.55;
        return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
      });
      const e = easeInOut(t);
      const cur = target.map((p, i) => ({
        x: start[i].x + (p.x - start[i].x) * e,
        y: start[i].y + (p.y - start[i].y) * e,
      }));

      // Faint model-space outline + travel trails.
      ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(start[0].x, start[0].y);
      ctx.lineTo(start[1].x, start[1].y);
      ctx.lineTo(start[2].x, start[2].y);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        ctx.moveTo(start[i].x, start[i].y);
        ctx.lineTo(cur[i].x, cur[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Transformed-triangle outline fades in near the end.
      if (t > 0.6) {
        ctx.strokeStyle = tri.color;
        ctx.globalAlpha *= (t - 0.6) / 0.4;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(target[0].x, target[0].y);
        ctx.lineTo(target[1].x, target[1].y);
        ctx.lineTo(target[2].x, target[2].y);
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha /= (t - 0.6) / 0.4;
      }

      for (const p of cur) {
        ctx.fillStyle = tri.color;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    };

    const drawGrid = (content: Rect): void => {
      ctx.strokeStyle = COLOR_GRID;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 0; c <= GRID_COLS; c++) {
        const x = content.x + (c * content.w) / GRID_COLS;
        ctx.moveTo(x, content.y);
        ctx.lineTo(x, content.y + content.h);
      }
      for (let r = 0; r <= GRID_ROWS; r++) {
        const y = content.y + (r * content.h) / GRID_ROWS;
        ctx.moveTo(content.x, y);
        ctx.lineTo(content.x + content.w, y);
      }
      ctx.stroke();
    };

    const drawStageRaster = (tri: SceneTri, content: Rect, t: number): void => {
      drawGrid(content);
      if (t <= 0) return;
      const mapped = mapTriToRect(tri, content);
      const cells = coveredCells(mapped, content);
      const k = Math.ceil(t * cells.length);
      ctx.fillStyle = COLOR_COVERAGE;
      for (let i = 0; i < k; i++) {
        const c = cells[i];
        ctx.fillRect(c.x, c.y, c.w, c.h);
      }
      ctx.strokeStyle = "rgba(226, 232, 240, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(mapped[0].x, mapped[0].y);
      ctx.lineTo(mapped[1].x, mapped[1].y);
      ctx.lineTo(mapped[2].x, mapped[2].y);
      ctx.closePath();
      ctx.stroke();
    };

    const drawStageFragment = (tri: SceneTri, content: Rect, t: number): void => {
      drawGrid(content);
      if (t <= 0) return;
      const mapped = mapTriToRect(tri, content);
      const cells = coveredCells(mapped, content);
      const k = Math.ceil(t * cells.length);
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        // Colored swatch once shaded; a dim "fragment in flight" placeholder before.
        ctx.fillStyle = i < k ? tri.color : "rgba(148, 163, 184, 0.25)";
        ctx.globalAlpha *= i < k && i % 2 === 1 ? 0.85 : 1; // subtle per-fragment variation
        ctx.fillRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
        ctx.globalAlpha /= i < k && i % 2 === 1 ? 0.85 : 1;
      }
    };

    const drawStageFramebuffer = (content: Rect, tri: SceneTri | null, t: number): void => {
      // Fit the 4:3 framebuffer inside the content rect.
      const scale = Math.min(content.w / FB_W, content.h / FB_H);
      const w = FB_W * scale;
      const h = FB_H * scale;
      const r: Rect = {
        x: content.x + (content.w - w) / 2,
        y: content.y + (content.h - h) / 2,
        w,
        h,
      };
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(fb, r.x, r.y, r.w, r.h);
      ctx.imageSmoothingEnabled = true;
      if (tri && t > 0) {
        // The incoming triangle fades in as its fragments are merged.
        ctx.globalAlpha *= t;
        ctx.fillStyle = tri.color;
        fbTriPath(ctx, tri, r);
        ctx.fill();
        ctx.globalAlpha /= t;
      }
      ctx.strokeStyle = COLOR_BOX_BORDER;
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    };

    const drawArrow = (x0: number, x1: number, y: number): void => {
      ctx.strokeStyle = COLOR_ARROW;
      ctx.fillStyle = COLOR_ARROW;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1 - 7, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x1 - 8, y - 4.5);
      ctx.lineTo(x1 - 8, y + 4.5);
      ctx.closePath();
      ctx.fill();
    };

    const draw = (): void => {
      const s = stateRef.current;
      const a = animRef.current;
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

      const pad = 14;
      const gap = Math.max(26, Math.min(44, w * 0.05));
      const boxW = (w - pad * 2 - gap * 3) / 4;
      const boxH = Math.min(h * 0.52, boxW * 1.5);
      const boxY = h * 0.5 - boxH / 2 + 6;
      boxRects = STAGES.map((_, i) => ({
        x: pad + i * (boxW + gap),
        y: boxY,
        w: boxW,
        h: boxH,
      }));

      const arrowY = boxY + boxH / 2;
      for (let i = 0; i < 3; i++) {
        const r = boxRects[i];
        drawArrow(r.x + r.w + 3, r.x + r.w + gap - 3, arrowY);
      }
      const tri = a.tri < SCENE.length ? SCENE[a.tri] : SCENE[SCENE.length - 1];
      for (let i = 0; i < 4; i++) {
        const r = boxRects[i];
        const isActive = a.stage === i;
        const isHovered = hoverRef.current === i;

        ctx.fillStyle = COLOR_BOX;
        ctx.beginPath();
        ctx.roundRect(r.x, r.y, r.w, r.h, 8);
        ctx.fill();
        if (isHovered) {
          ctx.fillStyle = "rgba(245, 158, 11, 0.08)";
          ctx.fill();
        }
        ctx.strokeStyle = isHovered ? COLOR_HOVER : isActive ? COLOR_ACTIVE : COLOR_BOX_BORDER;
        ctx.lineWidth = isHovered || isActive ? 2 : 1;
        ctx.stroke();

        if (s.labels) {
          ctx.font = "600 11px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = isHovered ? COLOR_HOVER : isActive ? COLOR_ACTIVE : COLOR_TEXT;
          ctx.fillText(STAGES[i].name, r.x + r.w / 2, r.y - 8, r.w + gap * 0.8);
          ctx.font = "10px system-ui, sans-serif";
          ctx.fillStyle = STAGES[i].kind === "programmable" ? COLOR_PROGRAMMABLE : COLOR_FIXED;
          ctx.fillText(STAGES[i].kind, r.x + r.w / 2, r.y + r.h + 14, r.w + gap * 0.8);
          ctx.textAlign = "left";
        }

        // Progress for this box: done for passed stages, animated for the active one.
        const progress = a.stage > i || a.stage === HOLD_STAGE ? 1 : a.stage === i ? a.t : 0;
        const inset = 12;
        const content: Rect = {
          x: r.x + inset,
          y: r.y + inset,
          w: r.w - inset * 2,
          h: r.h - inset * 2,
        };
        ctx.save();
        ctx.globalAlpha = i === 3 || isActive ? 1 : 0.45;
        if (i === 0) drawStageVertex(tri, content, progress);
        else if (i === 1) drawStageRaster(tri, content, progress);
        else if (i === 2) drawStageFragment(tri, content, progress);
        else drawStageFramebuffer(content, a.stage === 3 ? tri : null, a.stage === 3 ? a.t : 0);
        ctx.restore();
      }

      if (s.labels) {
        // The arrow into the framebuffer is where merging/depth testing happens.
        // The gap is too narrow for the text, so it floats above the boxes with
        // a dashed leader line dropping down (through the gap) to the arrow.
        const r2 = boxRects[2];
        const mx = r2.x + r2.w + gap / 2;
        ctx.font = "10px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = COLOR_TEXT_DIM;
        const labelX = Math.min(mx, w - pad - 44);
        ctx.fillText("output merging", labelX, boxY - 36);
        ctx.fillText("depth test", labelX, boxY - 25);
        ctx.textAlign = "left";
        ctx.strokeStyle = COLOR_ARROW;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(mx, boxY - 20);
        ctx.lineTo(mx, arrowY - 6);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (s.labels) {
        ctx.font = "10px system-ui, sans-serif";
        ctx.fillStyle = COLOR_TEXT_DIM;
        const label =
          a.stage === HOLD_STAGE
            ? "frame complete — presenting"
            : `triangle ${a.tri + 1} / ${SCENE.length}`;
        ctx.fillText(label, pad, h - 10);
      }
    };

    const tick = (now: number): void => {
      const s = stateRef.current;
      const a = animRef.current;
      const dt = Math.min((now - lastNow) / 1000, 0.1);
      lastNow = now;

      if (s.autoPlay || steppingRef.current) {
        a.t += (dt * s.speed) / STAGE_SECONDS;
        while (a.t >= 1) {
          a.t -= 1;
          handOff();
          if (steppingRef.current) {
            steppingRef.current = false;
            a.t = 0;
          }
        }
      }

      // Publish triangle/stage to React only when they change (caption updates).
      if (a.tri !== publishedTri || a.stage !== publishedStage) {
        publishedTri = a.tri;
        publishedStage = a.stage;
        setInfo({ tri: a.tri, stage: a.stage });
      }

      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const hitBox = (e: PointerEvent): number | null => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const idx = boxRects.findIndex(
        (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h,
      );
      return idx === -1 ? null : idx;
    };

    const onPointerMove = (e: PointerEvent): void => {
      const idx = hitBox(e);
      if (idx !== hoverRef.current) {
        hoverRef.current = idx;
        setHovered(idx);
      }
      canvas.style.cursor = idx === null ? "default" : "help";
    };
    const onPointerLeave = (): void => {
      if (hoverRef.current !== null) {
        hoverRef.current = null;
        setHovered(null);
      }
    };
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      apiRef.current = null;
    };
  }, []);

  const triName = `Triangle ${Math.min(info.tri + 1, SCENE.length)}/${SCENE.length}`;
  const caption =
    hovered !== null
      ? STAGES[hovered].hover
      : info.stage === HOLD_STAGE
        ? `All ${SCENE.length} triangles are merged — the framebuffer holds the finished image the display scans out. Next frame, it clears and the pipeline runs again.`
        : `${STAGES[info.stage].active(triName)}${
            state.autoPlay
              ? " Hover a box for what that stage is."
              : " Step advances one stage hand-off."
          }`;

  const handleReset = (): void => {
    animRef.current = { tri: 0, stage: 0, t: 0 };
    steppingRef.current = false;
    apiRef.current?.clearFb();
    setState({ ...INITIAL });
    setInfo({ tri: 0, stage: 0 });
    setHovered(null);
  };

  return (
    <PlaygroundFrame
      title="The render pipeline, one triangle at a time"
      caption={caption}
      onReset={handleReset}
      controls={
        <>
          <SwitchControl
            label="Auto-play"
            checked={state.autoPlay}
            onChange={(autoPlay) => setState((s) => ({ ...s, autoPlay }))}
          />
          <calcite-button
            width="full"
            kind="brand"
            appearance="outline-fill"
            icon-start="forward"
            disabled={state.autoPlay || undefined}
            onClick={() => {
              steppingRef.current = true;
            }}
          >
            Step
          </calcite-button>
          <SliderControl
            label="Speed"
            value={state.speed}
            min={0.25}
            max={3}
            step={0.25}
            onInput={(speed) => setState((s) => ({ ...s, speed }))}
            format={(v) => `×${v}`}
          />
          <SwitchControl
            label="Labels"
            checked={state.labels}
            onChange={(labels) => setState((s) => ({ ...s, labels }))}
          />
        </>
      }
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        aria-label="Animated GPU pipeline diagram: triangles flow through vertex shader, rasterizer, fragment shader and framebuffer stages"
      />
    </PlaygroundFrame>
  );
}
