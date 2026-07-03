import { useEffect, useRef, useState } from "react";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl, SwitchControl } from "../../components/controls";

/**
 * Display-pipeline simulator in ~30× slow motion. A scanout beam sweeps the
 * virtual monitor top to bottom, copying rows out of the FRONT buffer exactly
 * when it passes them, while a simulated GPU paints an animated scene into a
 * buffer element by element (sky → mountains → ball → frame number). Three
 * strategies: single buffering (the beam reads the buffer mid-paint — the
 * half-drawn frames double buffering exists to prevent), double buffering
 * with immediate swap (tear line mid-sweep), and double + vsync (only
 * complete frames, with the 60 → 30 fps snap when a frame misses the
 * deadline). A real browser canvas is always composited double-buffered by
 * the OS, so these artifacts can only be shown as a simulation — that is
 * precisely the point of the term.
 */

type BufferMode = "single" | "double" | "double-vsync";

interface DemoState {
  mode: BufferMode;
  /** Simulated milliseconds the GPU needs to paint one frame. */
  drawMs: number;
  pause: boolean;
}

const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const INITIAL: DemoState = {
  mode: "single",
  drawMs: 22,
  pause: prefersReducedMotion,
};

/** Simulated display refresh interval (60 Hz) and the slow-motion factor. */
const REFRESH_MS = 1000 / 60;
const SLOWMO = 30;

const PAD = 12;
const LABEL_H = 16;
const GAP = 10;
const THUMB_H = 84;

const COLOR_BG = "#0b0e14";
const COLOR_PANEL = "rgba(148, 163, 184, 0.35)";
const COLOR_TEXT = "rgba(226, 232, 240, 0.75)";
const COLOR_FRONT = "#7dd3fc";
const COLOR_BACK = "#fbbf24";
const COLOR_BEAM = "rgba(125, 211, 252, 0.95)";
const COLOR_TEAR = "#f87171";

/** Scene parameters frozen at the moment a frame starts painting. */
interface FrameSpec {
  no: number;
  animT: number;
}

function ctx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const c = canvas.getContext("2d");
  if (!c) throw new Error("2D canvas not supported");
  return c;
}

/** Ball position: triangle-wave sweep with a sine bounce, in scene fractions. */
function ballPos(animT: number): { fx: number; fy: number } {
  const sweep = (animT % 340) / 340;
  const fx = 0.1 + 0.8 * (sweep < 0.5 ? sweep * 2 : 2 - sweep * 2);
  const bounce = Math.abs(Math.sin((Math.PI * (animT % 170)) / 170));
  return { fx, fy: 0.68 - bounce * 0.16 };
}

/**
 * The frame is painted as a sequence of steps, each taking a slice of the
 * GPU's draw time — the order (background first, frame number last) is what
 * makes a half-painted frame instantly recognizable.
 */
const OPS: {
  weight: number;
  paint: (c: CanvasRenderingContext2D, w: number, h: number, f: FrameSpec) => void;
}[] = [
  {
    weight: 0.6, // clear — the dark flash single buffering leaks to the screen
    paint: (c, w, h) => {
      c.fillStyle = "#0f172a";
      c.fillRect(0, 0, w, h);
    },
  },
  {
    weight: 1.6, // sky
    paint: (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h * 0.74);
      g.addColorStop(0, "#0c4a6e");
      g.addColorStop(1, "#38bdf8");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h * 0.74);
    },
  },
  {
    weight: 0.6, // sun
    paint: (c, w, h) => {
      c.fillStyle = "#fde047";
      c.beginPath();
      c.arc(w * 0.8, h * 0.2, Math.min(w, h) * 0.055, 0, Math.PI * 2);
      c.fill();
    },
  },
  {
    weight: 1.6, // far ridge
    paint: (c, w, h) => {
      c.fillStyle = "#334155";
      c.beginPath();
      c.moveTo(0, h * 0.62);
      for (const [fx, fy] of [
        [0.12, 0.42],
        [0.25, 0.58],
        [0.38, 0.36],
        [0.52, 0.6],
        [0.66, 0.44],
        [0.8, 0.62],
        [0.92, 0.5],
        [1, 0.6],
      ])
        c.lineTo(w * fx, h * fy);
      c.lineTo(w, h * 0.74);
      c.lineTo(0, h * 0.74);
      c.closePath();
      c.fill();
    },
  },
  {
    weight: 1.2, // near hills
    paint: (c, w, h) => {
      c.fillStyle = "#1e293b";
      c.beginPath();
      c.moveTo(0, h * 0.66);
      for (const [fx, fy] of [
        [0.15, 0.56],
        [0.33, 0.68],
        [0.5, 0.58],
        [0.7, 0.69],
        [0.85, 0.6],
        [1, 0.68],
      ])
        c.lineTo(w * fx, h * fy);
      c.lineTo(w, h * 0.74);
      c.lineTo(0, h * 0.74);
      c.closePath();
      c.fill();
    },
  },
  {
    weight: 0.8, // ground
    paint: (c, w, h) => {
      c.fillStyle = "#173524";
      c.fillRect(0, h * 0.74, w, h * 0.26);
      c.fillStyle = "rgba(148, 163, 184, 0.35)";
      c.fillRect(0, h * 0.74, w, 1);
    },
  },
  {
    weight: 1.2, // the moving ball — displaced across a tear, missing when half-drawn
    paint: (c, w, h, f) => {
      const { fx, fy } = ballPos(f.animT);
      const r = Math.min(w, h) * 0.05;
      c.fillStyle = "rgba(0, 0, 0, 0.35)";
      c.beginPath();
      c.ellipse(w * fx, h * 0.75, r * 0.9, r * 0.28, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#fbbf24";
      c.strokeStyle = "#92400e";
      c.lineWidth = Math.max(1, r * 0.14);
      c.beginPath();
      c.arc(w * fx, h * fy, r, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    },
  },
  {
    weight: 1.0, // frame number, painted LAST — its absence marks an unfinished frame
    paint: (c, w, h, f) => {
      c.fillStyle = "rgba(248, 250, 252, 0.95)";
      c.font = `700 ${Math.round(h * 0.13)}px system-ui, sans-serif`;
      c.textAlign = "left";
      c.textBaseline = "alphabetic";
      c.fillText(`#${f.no}`, w * 0.04, h * 0.18);
      c.font = `500 ${Math.round(h * 0.05)}px system-ui, sans-serif`;
      c.fillStyle = "rgba(248, 250, 252, 0.6)";
      c.fillText("frame", w * 0.04, h * 0.24);
    },
  },
];
const OPS_TOTAL_WEIGHT = OPS.reduce((s, o) => s + o.weight, 0);

interface PaintJob {
  target: 0 | 1;
  op: number;
  budget: number;
  costs: number[];
  frame: FrameSpec;
}

interface Sim {
  buffers: [HTMLCanvasElement, HTMLCanvasElement];
  screen: HTMLCanvasElement;
  front: 0 | 1;
  /** Beam position in device rows of the buffer. */
  beamRow: number;
  frameNo: number;
  paint: PaintJob | null;
  pendingSwap: boolean;
  /** Sim timestamps of "new frame reached the screen" events. */
  presents: number[];
  tear: { frac: number; life: number } | null;
  simTime: number;
  lastMode: BufferMode;
}

export default function DoubleBuffering(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<DemoState>({ ...INITIAL });
  const apiRef = useRef<{ reset: () => void } | null>(null);
  const [state, setState] = useState<DemoState>({ ...INITIAL });
  const [fps, setFps] = useState<number | null>(null);

  // Mirror state into a ref so the RAF loop reads fresh values without
  // re-creating the simulation effect.
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = ctx2d(canvas);

    const mkCanvas = (): HTMLCanvasElement => document.createElement("canvas");
    const sim: Sim = {
      buffers: [mkCanvas(), mkCanvas()],
      screen: mkCanvas(),
      front: 0,
      beamRow: 0,
      frameNo: 0,
      paint: null,
      pendingSwap: false,
      presents: [],
      tear: null,
      simTime: 0,
      lastMode: stateRef.current.mode,
    };

    const opCosts = (drawMs: number): number[] => OPS.map((o) => (drawMs * o.weight) / OPS_TOTAL_WEIGHT);

    /** Paint one complete frame immediately (initial/reset baseline). */
    const paintFull = (target: 0 | 1): void => {
      const buf = sim.buffers[target];
      const c = ctx2d(buf);
      sim.frameNo += 1;
      const frame: FrameSpec = { no: sim.frameNo, animT: sim.simTime };
      for (const op of OPS) op.paint(c, buf.width, buf.height, frame);
    };

    const resetSim = (): void => {
      sim.front = 0;
      sim.beamRow = 0;
      sim.frameNo = 0;
      sim.paint = null;
      sim.pendingSwap = false;
      sim.presents = [];
      sim.tear = null;
      sim.simTime = 0;
      sim.lastMode = stateRef.current.mode;
      if (sim.buffers[0].width > 0) {
        paintFull(0);
        ctx2d(sim.screen).drawImage(sim.buffers[0], 0, 0);
      }
    };

    /** Resize buffers to the monitor panel's device-pixel size when needed. */
    const layout = (): {
      w: number;
      h: number;
      dpr: number;
      mon: { x: number; y: number; w: number; h: number };
      thumbs: { x: number; y: number; w: number; h: number }[];
    } => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pw = Math.round(w * dpr);
      const ph = Math.round(h * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      const monH = Math.max(80, h - PAD * 2 - LABEL_H * 2 - GAP - THUMB_H);
      const mon = { x: PAD, y: PAD + LABEL_H, w: w - PAD * 2, h: monH };
      const ty = mon.y + mon.h + GAP + LABEL_H;
      const tw = (w - PAD * 2 - GAP) / 2;
      const thumbs = [
        { x: PAD, y: ty, w: tw, h: THUMB_H },
        { x: PAD + tw + GAP, y: ty, w: tw, h: THUMB_H },
      ];
      const bw = Math.max(1, Math.round(mon.w * dpr));
      const bh = Math.max(1, Math.round(mon.h * dpr));
      if (sim.buffers[0].width !== bw || sim.buffers[0].height !== bh) {
        for (const b of [...sim.buffers, sim.screen]) {
          b.width = bw;
          b.height = bh;
        }
        resetSim();
      }
      return { w, h, dpr, mon, thumbs };
    };

    const present = (): void => {
      sim.presents.push(sim.simTime);
      if (sim.presents.length > 6) sim.presents.shift();
    };

    const startFrame = (mode: BufferMode, drawMs: number): void => {
      sim.frameNo += 1;
      sim.paint = {
        target: mode === "single" ? sim.front : ((1 - sim.front) as 0 | 1),
        op: 0,
        budget: 0,
        costs: opCosts(drawMs),
        frame: { no: sim.frameNo, animT: sim.simTime },
      };
    };

    const gpuStep = (dt: number, mode: BufferMode, drawMs: number): void => {
      if (sim.paint === null && !(mode === "double-vsync" && sim.pendingSwap)) {
        startFrame(mode, drawMs);
      }
      const job = sim.paint;
      if (job === null) return; // blocked waiting for vsync
      job.budget += dt;
      const buf = sim.buffers[job.target];
      const c = ctx2d(buf);
      while (sim.paint !== null && job.op < OPS.length && job.budget >= job.costs[job.op]) {
        job.budget -= job.costs[job.op];
        OPS[job.op].paint(c, buf.width, buf.height, job.frame);
        job.op += 1;
        if (job.op === OPS.length) {
          // Frame complete — what happens next is the whole lesson.
          if (mode === "single") {
            present(); // the screen has been reading it all along
          } else if (mode === "double") {
            sim.front = (1 - sim.front) as 0 | 1;
            const bh = sim.buffers[0].height;
            if (sim.beamRow > 1 && sim.beamRow < bh - 1) {
              sim.tear = { frac: sim.beamRow / bh, life: 1 };
            }
            present();
          } else {
            sim.pendingSwap = true; // wait for the beam to finish its sweep
          }
          sim.paint = null;
        }
      }
    };

    const beamStep = (dt: number, mode: BufferMode): void => {
      const bh = sim.buffers[0].height;
      const bw = sim.buffers[0].width;
      if (bh <= 1) return;
      const sctx = ctx2d(sim.screen);
      let remaining = (dt / REFRESH_MS) * bh;
      let from = sim.beamRow;
      // Epsilon + iteration cap: float residue from `remaining -= to - from`
      // can leave ~1e-14 rows that no longer advance `from + remaining`,
      // which would otherwise spin this loop forever.
      let guard = 8;
      while (remaining > 1e-6 && guard > 0) {
        guard -= 1;
        const to = Math.min(bh, from + remaining);
        const y0 = Math.floor(from);
        const y1 = Math.min(bh, Math.ceil(to));
        if (y1 > y0) {
          sctx.drawImage(sim.buffers[sim.front], 0, y0, bw, y1 - y0, 0, y0, bw, y1 - y0);
        }
        remaining -= to - from;
        if (to >= bh) {
          // Vertical blank: the only moment a vsync'd swap is allowed.
          if (mode === "double-vsync" && sim.pendingSwap) {
            sim.front = (1 - sim.front) as 0 | 1;
            sim.pendingSwap = false;
            present();
          }
          from = 0;
        } else {
          from = to;
        }
      }
      sim.beamRow = from;
    };

    const badgeFor = (i: 0 | 1, mode: BufferMode): { text: string; color: string } => {
      if (mode === "single") {
        return i === sim.front
          ? { text: "Buffer A — GPU paints, display reads", color: COLOR_TEAR }
          : { text: "Buffer B — unused", color: COLOR_TEXT };
      }
      const name = i === 0 ? "Buffer A" : "Buffer B";
      if (i === sim.front) return { text: `${name} — FRONT · display reads`, color: COLOR_FRONT };
      return sim.pendingSwap
        ? { text: `${name} — BACK · waits for vsync`, color: COLOR_BACK }
        : { text: `${name} — BACK · GPU paints`, color: COLOR_BACK };
    };

    /** Ellipsize a label to fit a pixel width (thumbnail badges on narrow screens). */
    const clampText = (text: string, maxW: number): string => {
      if (ctx.measureText(text).width <= maxW) return text;
      let t = text;
      while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
      return `${t}…`;
    };

    let raf = 0;
    let last = performance.now();
    let lastStats = 0;
    const tick = (now: number): void => {
      const s = stateRef.current;
      const dtReal = Math.min(100, now - last);
      last = now;
      const { w, dpr, mon, thumbs } = layout();

      if (s.mode !== sim.lastMode) {
        // Mode switches abort the in-flight frame so states can't leak across.
        sim.lastMode = s.mode;
        sim.paint = null;
        sim.pendingSwap = false;
        sim.tear = null;
        sim.presents = [];
      }

      if (!s.pause) {
        const dtSim = dtReal / SLOWMO;
        sim.simTime += dtSim;
        gpuStep(dtSim, s.mode, s.drawMs);
        beamStep(dtSim, s.mode);
      }
      if (sim.tear !== null) {
        sim.tear.life -= dtReal / 1500;
        if (sim.tear.life <= 0) sim.tear = null;
      }

      // ---- draw the panel ----
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = COLOR_BG;
      ctx.fillRect(0, 0, w, canvas.clientHeight);
      ctx.textBaseline = "alphabetic";
      ctx.font = "600 11px system-ui, sans-serif";
      ctx.fillStyle = COLOR_TEXT;
      ctx.textAlign = "left";
      ctx.fillText("What the display shows", mon.x, mon.y - 5);
      ctx.textAlign = "right";
      ctx.fillText(`~${SLOWMO}× slow motion`, mon.x + mon.w, mon.y - 5);

      ctx.drawImage(sim.screen, mon.x, mon.y, mon.w, mon.h);
      ctx.strokeStyle = COLOR_PANEL;
      ctx.lineWidth = 1;
      ctx.strokeRect(mon.x + 0.5, mon.y + 0.5, mon.w - 1, mon.h - 1);

      // Scanout beam.
      const bh = sim.buffers[0].height;
      const beamY = mon.y + (bh > 0 ? (sim.beamRow / bh) * mon.h : 0);
      ctx.strokeStyle = COLOR_BEAM;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(mon.x, beamY);
      ctx.lineTo(mon.x + mon.w, beamY);
      ctx.stroke();
      ctx.fillStyle = COLOR_BEAM;
      ctx.beginPath();
      ctx.moveTo(mon.x + mon.w, beamY);
      ctx.lineTo(mon.x + mon.w + 7, beamY - 4);
      ctx.lineTo(mon.x + mon.w + 7, beamY + 4);
      ctx.closePath();
      ctx.fill();

      if (sim.tear !== null) {
        const ty = mon.y + sim.tear.frac * mon.h;
        ctx.globalAlpha = Math.max(0, Math.min(1, sim.tear.life));
        ctx.strokeStyle = COLOR_TEAR;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(mon.x, ty);
        ctx.lineTo(mon.x + 18, ty);
        ctx.stroke();
        ctx.fillStyle = COLOR_TEAR;
        ctx.font = "600 10px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("tear", mon.x + 22, ty + 3);
        ctx.globalAlpha = 1;
      }

      if (s.pause) {
        ctx.fillStyle = "rgba(226, 232, 240, 0.85)";
        ctx.font = "600 12px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("paused", mon.x + mon.w / 2, mon.y + 16);
      }

      // Buffer thumbnails with live role badges.
      for (const i of [0, 1] as const) {
        const t = thumbs[i];
        const badge = badgeFor(i, s.mode);
        ctx.font = "600 10px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillStyle = badge.color;
        ctx.fillText(clampText(badge.text, t.w), t.x, t.y - 4);
        if (s.mode === "single" && i !== sim.front) {
          ctx.fillStyle = "#111827";
          ctx.fillRect(t.x, t.y, t.w, t.h);
          ctx.fillStyle = COLOR_TEXT;
          ctx.font = "500 10px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("unused", t.x + t.w / 2, t.y + t.h / 2 + 3);
        } else {
          ctx.drawImage(sim.buffers[i], t.x, t.y, t.w, t.h);
        }
        ctx.strokeStyle = i === sim.front ? COLOR_FRONT : COLOR_PANEL;
        ctx.strokeRect(t.x + 0.5, t.y + 0.5, t.w - 1, t.h - 1);
      }

      // Presented-rate readout, throttled into React state for the caption.
      if (now - lastStats > 250) {
        lastStats = now;
        const p = sim.presents;
        const next =
          p.length >= 2 ? Math.round((1000 * (p.length - 1)) / (p[p.length - 1] - p[0])) : null;
        setFps((prev) => (prev === next ? prev : next));
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    apiRef.current = { reset: resetSim };

    return () => {
      cancelAnimationFrame(raf);
      apiRef.current = null;
    };
  }, []);

  const fpsText = fps === null ? "…" : `${fps} fps`;
  const caption =
    state.mode === "single"
      ? `The GPU is painting straight into the buffer the display is scanning — the beam picks up frames mid-paint: sky with no mountains yet, a missing ball, no frame number. New frames finish at ~${fpsText}, but the screen almost never shows a clean one. This flicker is exactly what double buffering prevents.`
      : state.mode === "double"
        ? `Finished frames swap in the instant they're done — even while the beam is mid-sweep. Above the swap point the old frame, below it the new one: a tear line, with the ball displaced across the seam. New frames reach the screen at ~${fpsText}.`
        : state.drawMs <= REFRESH_MS
          ? `Swaps now wait for the beam to finish its sweep (the vertical blank), so only complete frames ever appear. Drawing takes ${state.drawMs} ms against the 16.7 ms refresh — comfortably in budget, a fresh frame every sweep (~${fpsText}).`
          : `Swaps now wait for the beam to finish its sweep, so only complete frames ever appear — but at ${state.drawMs} ms per frame the GPU misses the 16.7 ms deadline and the finished frame waits for the next sweep: the rate snaps down to ~${fpsText} instead of degrading smoothly.`;

  return (
    <PlaygroundFrame
      title="Double buffering: watch the display being fed"
      caption={caption}
      onReset={() => {
        setState({ ...INITIAL });
        apiRef.current?.reset();
      }}
      controls={
        <>
          <SegmentedControl<BufferMode>
            label="Buffering"
            value={state.mode}
            options={[
              { value: "single", label: "Single" },
              { value: "double", label: "Double" },
              { value: "double-vsync", label: "Double + vsync" },
            ]}
            onChange={(mode) => setState((s) => ({ ...s, mode }))}
          />
          <SliderControl
            label="GPU draw time"
            value={state.drawMs}
            min={4}
            max={40}
            step={1}
            format={(v) => `${v} ms`}
            onInput={(drawMs) => setState((s) => ({ ...s, drawMs }))}
          />
          <SwitchControl
            label="Pause"
            checked={state.pause}
            onChange={(pause) => setState((s) => ({ ...s, pause }))}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            A ~{SLOWMO}× slow-motion simulation of the display pipeline: the beam reads the front
            buffer row by row, exactly like your monitor. A real browser canvas is always
            double-buffered by the OS compositor, so the flicker and tearing here can only be
            simulated — they are the artifacts double buffering (plus vsync) exists to prevent.
            Try “Double” with a draw time that isn&apos;t a multiple of 16.7 ms and watch the tear
            line wander.
          </p>
        </>
      }
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        aria-label="Double buffering simulator: a virtual display scanned by a beam, with front and back buffer thumbnails, in single-buffer, double-buffer, and vsync modes"
      />
    </PlaygroundFrame>
  );
}
