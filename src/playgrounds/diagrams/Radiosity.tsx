import { useEffect, useRef, useState } from "react";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";

import "@esri/calcite-components/components/calcite-button";

/**
 * Radiosity, one bounce at a time. A 2D room cross-section is chopped into
 * patches; one ceiling patch emits light. Every iteration each patch
 * distributes its unshot energy to every other patch it faces, weighted by a
 * simple form factor (cosine at both ends, falloff with distance). Step it
 * by hand and watch energy spread outward from the lamp, the red wall bleed
 * pink onto floor and ceiling, and the whole solution settle — radiosity is
 * exactly this diffuse bookkeeping run to convergence.
 */

interface DemoState {
  autoPlay: boolean;
  divisions: number;
}

const INITIAL: DemoState = {
  autoPlay: false,
  divisions: 12,
};

interface Vec2 {
  x: number;
  y: number;
}

interface Patch {
  center: Vec2;
  /** Inward-facing unit normal. */
  normal: Vec2;
  /** Endpoints along the wall, normalized room coordinates. */
  a: Vec2;
  b: Vec2;
  length: number;
  reflectance: [number, number, number];
  emission: [number, number, number];
}

const STEP_INTERVAL_MS = 450; // auto-play cadence — slow enough to follow
const CONVERGED_FRACTION = 0.004; // unshot below this share of emitted = done
const EXPOSURE = 3.2;
const COLOR_BG = "#14181f";
const PATCH_WIDTH = 14; // px — patch bar thickness
const RED_WALL: [number, number, number] = [0.82, 0.16, 0.14];
const GRAY_WALL: [number, number, number] = [0.68, 0.68, 0.68];
const EMISSION: [number, number, number] = [13, 12.4, 11.2]; // per unit length

interface Solver {
  patches: Patch[];
  /** Row-normalized form factors, patches.length² entries. */
  formFactors: Float32Array;
  /** Accumulated radiosity (energy density) per patch, RGB. */
  radiosity: Float32Array;
  /** Energy still waiting to be shot, RGB totals per patch. */
  unshot: Float32Array;
  emittedTotal: number;
  iteration: number;
}

/**
 * Build the room: a unit square (y down), each wall split into `divisions`
 * patches. Left wall is red, everything else light gray; the middle of the
 * ceiling emits. Form factors are precomputed for every patch pair.
 */
function buildSolver(divisions: number): Solver {
  const corners: [Vec2, Vec2, Vec2, Vec2] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  const patches: Patch[] = [];
  for (let wall = 0; wall < 4; wall++) {
    const a = corners[wall];
    const b = corners[(wall + 1) % 4];
    // Walls run clockwise (y down), so the inward normal is the left-hand one.
    const wx = b.x - a.x;
    const wy = b.y - a.y;
    const wallLen = Math.hypot(wx, wy);
    const normal: Vec2 = { x: -wy / wallLen, y: wx / wallLen };
    const isCeiling = wall === 0;
    const isLeft = wall === 3;
    for (let i = 0; i < divisions; i++) {
      const t0 = i / divisions;
      const t1 = (i + 1) / divisions;
      const pa: Vec2 = { x: a.x + wx * t0, y: a.y + wy * t0 };
      const pb: Vec2 = { x: a.x + wx * t1, y: a.y + wy * t1 };
      const center: Vec2 = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
      // The emitter: ceiling patches whose center falls in the middle fifth.
      const emits = isCeiling && Math.abs(center.x - 0.5) < 0.1;
      patches.push({
        center,
        normal,
        a: pa,
        b: pb,
        length: wallLen / divisions,
        reflectance: emits ? [0, 0, 0] : isLeft ? RED_WALL : GRAY_WALL,
        emission: emits ? EMISSION : [0, 0, 0],
      });
    }
  }

  const n = patches.length;
  const formFactors = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    const pi = patches[i];
    let rowSum = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const pj = patches[j];
      const dx = pj.center.x - pi.center.x;
      const dy = pj.center.y - pi.center.y;
      const r = Math.hypot(dx, dy);
      if (r < 1e-6) continue;
      const cosI = (dx * pi.normal.x + dy * pi.normal.y) / r;
      const cosJ = (-dx * pj.normal.x - dy * pj.normal.y) / r;
      if (cosI <= 0 || cosJ <= 0) continue; // facing away — not visible
      // 2D differential form factor: cosθi·cosθj / (2r), times receiver size.
      const f = ((cosI * cosJ) / (2 * r)) * pj.length;
      formFactors[i * n + j] = f;
      rowSum += f;
    }
    // Normalize each row so every shot conserves energy exactly.
    if (rowSum > 0) {
      for (let j = 0; j < n; j++) formFactors[i * n + j] /= rowSum;
    }
  }

  const radiosity = new Float32Array(n * 3);
  const unshot = new Float32Array(n * 3);
  let emittedTotal = 0;
  for (let i = 0; i < n; i++) {
    const p = patches[i];
    for (let c = 0; c < 3; c++) {
      const e = p.emission[c] * p.length; // total energy, not density
      radiosity[i * 3 + c] = e;
      unshot[i * 3 + c] = e;
    }
    emittedTotal += unshot[i * 3] + unshot[i * 3 + 1] + unshot[i * 3 + 2];
  }

  return { patches, formFactors, radiosity, unshot, emittedTotal, iteration: 0 };
}

/** One iteration: every patch shoots all of its unshot energy at once. */
function stepSolver(s: Solver): void {
  const n = s.patches.length;
  const received = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const ur = s.unshot[i * 3];
    const ug = s.unshot[i * 3 + 1];
    const ub = s.unshot[i * 3 + 2];
    if (ur + ug + ub < 1e-9) continue;
    for (let j = 0; j < n; j++) {
      const f = s.formFactors[i * n + j];
      if (f === 0) continue;
      const refl = s.patches[j].reflectance;
      received[j * 3] += ur * f * refl[0];
      received[j * 3 + 1] += ug * f * refl[1];
      received[j * 3 + 2] += ub * f * refl[2];
    }
  }
  for (let k = 0; k < received.length; k++) {
    s.radiosity[k] += received[k];
    s.unshot[k] = received[k];
  }
  s.iteration++;
}

function unshotTotal(s: Solver): number {
  let total = 0;
  for (let k = 0; k < s.unshot.length; k++) total += s.unshot[k];
  return total;
}

export default function Radiosity(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<DemoState>({ ...INITIAL });
  const apiRef = useRef<{
    step: () => void;
    rebuild: (divisions: number) => void;
    ensureLoop: () => void;
  } | null>(null);
  const [state, setState] = useState<DemoState>({ ...INITIAL });
  const [progress, setProgress] = useState({ iteration: 0, unshotPct: 100 });

  // Mirror state into a ref for the RAF loop; kick the loop on auto-play.
  useEffect(() => {
    stateRef.current = state;
    if (state.autoPlay) apiRef.current?.ensureLoop();
  }, [state]);

  // Changing the patch size rebuilds the patch grid and restarts the solve.
  useEffect(() => {
    apiRef.current?.rebuild(state.divisions);
  }, [state.divisions]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas not supported");

    let solver = buildSolver(stateRef.current.divisions);
    let raf = 0;
    let running = false;
    let lastStep = 0;

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

      // Square room centered in the stage.
      const size = Math.min(w, h) - 2 * (PATCH_WIDTH + 26);
      const ox = (w - size) / 2;
      const oy = (h - size) / 2;
      const px = (p: Vec2): [number, number] => [ox + p.x * size, oy + p.y * size];

      ctx.lineCap = "butt";
      const gap = 1.5;
      for (let i = 0; i < solver.patches.length; i++) {
        const p = solver.patches[i];
        const len = p.length * size;
        const inset = Math.min(gap, len * 0.15) / len; // keep a hairline gap
        const a = px({
          x: p.a.x + (p.b.x - p.a.x) * inset,
          y: p.a.y + (p.b.y - p.a.y) * inset,
        });
        const b = px({
          x: p.b.x - (p.b.x - p.a.x) * inset,
          y: p.b.y - (p.b.y - p.a.y) * inset,
        });
        // Display color: tone-mapped energy density (resolution-independent).
        const rgb = [0, 1, 2].map((c) => {
          const density = solver.radiosity[i * 3 + c] / p.length;
          return Math.round((1 - Math.exp(-density * EXPOSURE)) * 255);
        });
        ctx.strokeStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
        ctx.lineWidth = PATCH_WIDTH;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }

      // Outline of the room interior plus a hint at the lamp.
      ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(ox, oy, size, size);
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillStyle = "rgba(226, 232, 240, 0.7)";
      ctx.textAlign = "center";
      ctx.fillText("emitter", ox + size / 2, oy - PATCH_WIDTH - 6);
      ctx.fillText("red wall", ox - PATCH_WIDTH - 4, oy + size / 2);
    };

    const report = (): void => {
      const pct = Math.max(0, Math.min(100, (unshotTotal(solver) / solver.emittedTotal) * 100));
      const iteration = solver.iteration;
      setProgress((prev) =>
        prev.iteration === iteration && Math.abs(prev.unshotPct - pct) < 0.01
          ? prev
          : { iteration, unshotPct: pct },
      );
    };

    const converged = (): boolean => unshotTotal(solver) < solver.emittedTotal * CONVERGED_FRACTION;

    const step = (): void => {
      if (converged()) return;
      stepSolver(solver);
      draw();
      report();
    };

    const tick = (now: number): void => {
      if (!stateRef.current.autoPlay || converged()) {
        running = false;
        return;
      }
      if (now - lastStep >= STEP_INTERVAL_MS) {
        lastStep = now;
        step();
      }
      raf = requestAnimationFrame(tick);
    };

    const ensureLoop = (): void => {
      if (running) return;
      running = true;
      lastStep = 0;
      raf = requestAnimationFrame(tick);
    };

    const rebuild = (divisions: number): void => {
      solver = buildSolver(divisions);
      draw();
      report();
    };

    apiRef.current = { step, rebuild, ensureLoop };

    const resizeObserver = new ResizeObserver(() => draw());
    resizeObserver.observe(canvas);
    draw();
    report();

    return () => {
      cancelAnimationFrame(raf);
      running = false;
      resizeObserver.disconnect();
      apiRef.current = null;
    };
  }, []);

  const isConverged = progress.unshotPct < CONVERGED_FRACTION * 100;
  const caption =
    progress.iteration === 0
      ? "Iteration 0: only the emitter holds energy. Press Step (or Auto-play) to shoot its light at every patch it faces — closer, squarely-facing patches receive more."
      : isConverged
        ? `Converged after ${progress.iteration} iterations: virtually no unshot energy is left. Notice the pink bleed the red wall left on the floor and ceiling — indirect color no direct-light model produces.`
        : `Iteration ${progress.iteration}: ${progress.unshotPct.toFixed(1)}% of the emitted energy is still unshot and will keep bouncing. Each step every patch re-shoots what it just received — watch the red wall stain its neighbors pink.`;

  const handleReset = (): void => {
    setState({ ...INITIAL });
    setProgress({ iteration: 0, unshotPct: 100 });
    apiRef.current?.rebuild(INITIAL.divisions);
  };

  return (
    <PlaygroundFrame
      title="Radiosity: light as patch-to-patch bookkeeping"
      caption={caption}
      onReset={handleReset}
      controls={
        <>
          <calcite-button
            width="full"
            kind="brand"
            appearance="outline-fill"
            icon-start="forward"
            disabled={state.autoPlay || isConverged || undefined}
            onClick={() => apiRef.current?.step()}
          >
            Step one bounce
          </calcite-button>
          <SwitchControl
            label="Auto-play"
            checked={state.autoPlay}
            onChange={(autoPlay) => setState((s) => ({ ...s, autoPlay }))}
          />
          <SliderControl
            label="Patch size"
            value={state.divisions}
            min={4}
            max={28}
            onInput={(divisions) => setState((s) => ({ ...s, divisions }))}
            format={(v) => `${v} / wall`}
          />
        </>
      }
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        aria-label="Radiosity demo: a 2D room of wall patches exchanging light energy iteration by iteration"
      />
    </PlaygroundFrame>
  );
}
