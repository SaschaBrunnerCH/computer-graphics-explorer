import { useEffect, useRef, useState } from "react";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";

/**
 * Frame-budget simulator. The "Work per frame" slider busy-waits that many
 * milliseconds inside the RAF callback — real CPU time, so the moving bars
 * on the left genuinely stutter. The right side plots the last 120 frame
 * times against the 16.7 ms (60 fps) and 33.3 ms (30 fps) guide lines.
 * With "Simulate vsync" on, presented frame times snap up to the next
 * 16.7 ms multiple: double buffering means a frame that misses the refresh
 * deadline sits in the back buffer until the next one — frame rate steps
 * 60 → 30 → 20 instead of degrading smoothly.
 */

interface DemoState {
  workMs: number;
  vsync: boolean;
  pause: boolean;
}

const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const INITIAL: DemoState = {
  workMs: 0,
  vsync: true,
  pause: prefersReducedMotion,
};

const REFRESH_MS = 1000 / 60; // simulated 60 Hz display
const HISTORY = 120; // frames kept in the graph
const MAX_WORK_MS = 50; // hard cap on the busy-wait
const GRAPH_MAX_MS = 60; // y-axis ceiling
const SNAP_GRACE_MS = 4; // RAF jitter tolerance before charging another refresh

const SCENE_BARS = [
  { speed: 150, color: "#38bdf8" },
  { speed: 240, color: "#fbbf24" },
  { speed: 330, color: "#4ade80" },
  { speed: 100, color: "#f472b6" },
] as const;

const COLOR_BG = "#0b0e14";
const COLOR_PANEL = "rgba(148, 163, 184, 0.35)";
const COLOR_TEXT = "rgba(226, 232, 240, 0.75)";
const COLOR_GUIDE_60 = "rgba(74, 222, 128, 0.7)";
const COLOR_GUIDE_30 = "rgba(251, 146, 60, 0.7)";

const PAD = 12;
const SCENE_BAR_W = 64;

/** Width of the left scene panel for a given canvas width (kept in sync between tick and draw). */
function sceneWidth(canvasW: number): number {
  return Math.max(120, (canvasW - PAD * 3) * 0.45);
}

/** Horizontal travel range for the bouncing bars inside the scene panel. */
function sceneRange(canvasW: number): number {
  return Math.max(1, sceneWidth(canvasW) - SCENE_BAR_W - 4);
}

function barColor(ms: number): string {
  if (ms <= REFRESH_MS + 1.5) return "#4ade80"; // within budget
  if (ms <= REFRESH_MS * 2 + 1.5) return "#fbbf24"; // one missed refresh
  return "#f87171"; // worse
}

export default function FrameTime(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<DemoState>({ ...INITIAL });
  const framesRef = useRef<number[]>([]);
  const barsRef = useRef<{ x: number; dir: number }[]>(SCENE_BARS.map(() => ({ x: 0, dir: 1 })));
  const [state, setState] = useState<DemoState>({ ...INITIAL });
  const [stats, setStats] = useState({ fps: 60, p99: REFRESH_MS });

  // Mirror state into a ref so the RAF loop reads fresh values without
  // re-creating the canvas setup effect.
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas not supported");

    let raf = 0;
    let lastNow = performance.now();
    let lastStats = 0;

    // The busy-wait must never run while the page is hidden, and coming back
    // must not register one giant fake frame.
    const onVisibility = (): void => {
      if (!document.hidden) lastNow = performance.now();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const draw = (): void => {
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

      const pad = PAD;
      const sceneW = sceneWidth(w);
      const graphX = pad * 2 + sceneW;
      const graphW = w - graphX - pad;
      const top = pad + 18;
      const bottom = h - pad - 16;

      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = COLOR_TEXT;
      ctx.fillText("scene (watch for stutter)", pad, pad + 8);
      ctx.fillText("frame time — last 120 frames", graphX, pad + 8);

      // --- left: the animated scene strip ---
      ctx.strokeStyle = COLOR_PANEL;
      ctx.lineWidth = 1;
      ctx.strokeRect(pad + 0.5, top + 0.5, sceneW - 1, bottom - top - 1);
      const barH = 16;
      const rows = SCENE_BARS.length;
      const rowGap = (bottom - top - rows * barH) / (rows + 1);
      const range = sceneRange(w);
      for (let i = 0; i < rows; i++) {
        const b = barsRef.current[i];
        const x = pad + 2 + Math.min(b.x, range);
        const y = top + rowGap + i * (barH + rowGap);
        ctx.fillStyle = SCENE_BARS[i].color;
        ctx.fillRect(x, y, SCENE_BAR_W, barH);
      }

      // --- right: the frame-time graph ---
      const graphH = bottom - top;
      const yFor = (ms: number): number =>
        bottom - (Math.min(ms, GRAPH_MAX_MS) / GRAPH_MAX_MS) * graphH;
      ctx.strokeStyle = COLOR_PANEL;
      ctx.strokeRect(graphX + 0.5, top + 0.5, graphW - 1, graphH - 1);

      const frames = framesRef.current;
      const bw = graphW / HISTORY;
      for (let i = 0; i < frames.length; i++) {
        const ms = frames[i];
        const y = yFor(ms);
        ctx.fillStyle = barColor(ms);
        ctx.fillRect(graphX + i * bw, y, Math.max(1, bw - 0.5), bottom - y);
      }

      // Guide lines on top of the bars so they stay readable.
      const guide = (ms: number, color: string, text: string): void => {
        const y = Math.round(yFor(ms)) + 0.5;
        ctx.strokeStyle = color;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(graphX, y);
        ctx.lineTo(graphX + graphW, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.fillText(text, graphX + 4, y - 3);
      };
      guide(REFRESH_MS, COLOR_GUIDE_60, "16.7 ms · 60 fps budget");
      guide(REFRESH_MS * 2, COLOR_GUIDE_30, "33.3 ms · 30 fps");

      const last = frames[frames.length - 1];
      if (last !== undefined) {
        ctx.fillStyle = COLOR_TEXT;
        ctx.textAlign = "right";
        ctx.fillText(`now: ${last.toFixed(1)} ms`, graphX + graphW - 4, top + 12);
        ctx.textAlign = "left";
      }
    };

    const tick = (now: number): void => {
      const s = stateRef.current;
      const rawDt = Math.min(now - lastNow, 100);
      lastNow = now;

      if (!s.pause && !document.hidden) {
        // THE control: burn real CPU time inside the frame (hard-capped).
        const limit = Math.min(Math.max(s.workMs, 0), MAX_WORK_MS);
        if (limit > 0) {
          const start = performance.now();
          while (performance.now() - start < limit) {
            // busy-wait — this is the simulated per-frame workload
          }
        }

        // What the user "sees" presented: with vsync the swap can only happen
        // on a refresh tick, so the frame time rounds UP to the next 16.7 ms
        // multiple (with a little grace for RAF timestamp jitter).
        const presented = s.vsync
          ? Math.max(1, Math.ceil((rawDt - SNAP_GRACE_MS) / REFRESH_MS)) * REFRESH_MS
          : rawDt;
        framesRef.current.push(presented);
        if (framesRef.current.length > HISTORY) framesRef.current.shift();

        // Advance the scene by real elapsed time: constant speed, so slow
        // frames show up as visibly larger jumps — that IS the stutter.
        const range = sceneRange(canvas.clientWidth);
        for (let i = 0; i < SCENE_BARS.length; i++) {
          const b = barsRef.current[i];
          b.x += (b.dir * SCENE_BARS[i].speed * rawDt) / 1000;
          if (b.x < 0) {
            b.x = 0;
            b.dir = 1;
          } else if (b.x > range) {
            b.x = range;
            b.dir = -1;
          }
        }

        if (now - lastStats > 250 && framesRef.current.length >= 10) {
          lastStats = now;
          const recent = framesRef.current.slice(-30);
          const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
          const sorted = [...framesRef.current].sort((a, b) => a - b);
          const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))];
          setStats({ fps: 1000 / mean, p99 });
        }
      }

      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const resizeObserver = new ResizeObserver(() => draw());
    resizeObserver.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const readout = `${stats.fps.toFixed(0)} fps · p99 ${stats.p99.toFixed(1)} ms.`;
  const overBudget = state.workMs > REFRESH_MS;
  const caption = state.pause
    ? "Paused — the graph holds the last 120 frames. The budget IS the frame: everything a frame needs must fit in 16.7 ms to hold 60 fps."
    : state.vsync
      ? overBudget
        ? `${readout} ${state.workMs} ms of work blew the 16.7 ms budget — with double buffering + vsync the finished image waits in the back buffer for the next refresh, so the rate snaps a whole step down (60 → 30 → 20 fps) instead of sliding.`
        : `${readout} Inside the 16.7 ms budget every frame catches its vsync — the budget IS the frame. Push the work past 16.7 ms and watch the frame rate snap, not slide: a missed deadline waits a whole refresh.`
      : `${readout} Vsync off: frames present the moment the work finishes, so frame time tracks the slider directly — on a real display that mid-scan swap is what causes tearing.`;

  const handleReset = (): void => {
    framesRef.current = [];
    barsRef.current = SCENE_BARS.map(() => ({ x: 0, dir: 1 }));
    setState({ ...INITIAL });
    setStats({ fps: 60, p99: REFRESH_MS });
  };

  return (
    <PlaygroundFrame
      title="The frame budget, live"
      caption={caption}
      onReset={handleReset}
      controls={
        <>
          <SliderControl
            label="Work per frame (ms)"
            value={state.workMs}
            min={0}
            max={MAX_WORK_MS}
            onInput={(workMs) => setState((s) => ({ ...s, workMs }))}
            format={(v) => `${v} ms`}
          />
          <SwitchControl
            label="Simulate vsync"
            checked={state.vsync}
            onChange={(vsync) => setState((s) => ({ ...s, vsync }))}
          />
          <SwitchControl
            label="Pause"
            checked={state.pause}
            onChange={(pause) => setState((s) => ({ ...s, pause }))}
          />
        </>
      }
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        aria-label="Frame budget simulator: moving bars stutter as per-frame work grows, with a live frame-time graph"
      />
    </PlaygroundFrame>
  );
}
