import { useEffect, useRef, useState } from "react";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";

/**
 * A tiny progressive 2D path tracer over a Cornell-box cross-section: one
 * emissive patch on the ceiling, red and green side walls, gray floor and
 * boxes. Every empty pixel fires random paths that bounce diffusely until
 * they find the light; results accumulate frame after frame. The image
 * starts as pure noise and visibly converges — that noise-to-clean
 * progression is the whole lesson of Monte Carlo path tracing.
 */

interface DemoState {
  pathsPerFrame: number;
  running: boolean;
}

const PREFERS_REDUCED_MOTION =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const INITIAL: DemoState = {
  pathsPerFrame: 2,
  running: !PREFERS_REDUCED_MOTION,
};

// Internal accumulation resolution — deliberately tiny, upscaled crisply.
const RES_W = 96;
const RES_H = 64;
const MAX_DEPTH = 6;
const FRAME_BUDGET_MS = 4; // chunk the pixel loop so frames stay responsive
const EPS = 1e-4;
const EXPOSURE = 1.1;

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Diffuse reflectance per channel. */
  albedo: [number, number, number];
  /** Radiance added when a path lands here. */
  emission: [number, number, number];
}

const GRAY: [number, number, number] = [0.72, 0.72, 0.72];
const NO_EMIT: [number, number, number] = [0, 0, 0];

/** The 2D Cornell box, in pixel coordinates of the internal buffer. */
const SCENE: readonly Rect[] = [
  // Emissive ceiling patch first (protrudes below the ceiling so rays hit it).
  { x0: 38, y0: 0, x1: 58, y1: 4, albedo: [0, 0, 0], emission: [7, 6.6, 5.9] },
  // Ceiling, floor, red left wall, green right wall.
  { x0: 0, y0: 0, x1: RES_W, y1: 2, albedo: GRAY, emission: NO_EMIT },
  { x0: 0, y0: RES_H - 2, x1: RES_W, y1: RES_H, albedo: GRAY, emission: NO_EMIT },
  { x0: 0, y0: 0, x1: 2, y1: RES_H, albedo: [0.85, 0.2, 0.18], emission: NO_EMIT },
  { x0: RES_W - 2, y0: 0, x1: RES_W, y1: RES_H, albedo: [0.22, 0.78, 0.25], emission: NO_EMIT },
  // Two gray boxes on the floor.
  { x0: 22, y0: 40, x1: 36, y1: RES_H - 2, albedo: GRAY, emission: NO_EMIT },
  { x0: 60, y0: 32, x1: 72, y1: RES_H - 2, albedo: GRAY, emission: NO_EMIT },
];

function insideRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
}

interface RayHit {
  t: number;
  nx: number;
  ny: number;
  rect: Rect;
}

/** Nearest ray/AABB hit via the slab method; normal faces the incoming ray. */
function intersect(px: number, py: number, dx: number, dy: number): RayHit | null {
  let best: RayHit | null = null;
  for (const r of SCENE) {
    const invX = 1 / dx;
    const invY = 1 / dy;
    let tx0 = (r.x0 - px) * invX;
    let tx1 = (r.x1 - px) * invX;
    if (tx0 > tx1) [tx0, tx1] = [tx1, tx0];
    let ty0 = (r.y0 - py) * invY;
    let ty1 = (r.y1 - py) * invY;
    if (ty0 > ty1) [ty0, ty1] = [ty1, ty0];
    const tNear = Math.max(tx0, ty0);
    const tFar = Math.min(tx1, ty1);
    if (tNear > tFar || tFar <= EPS) continue;
    const t = tNear > EPS ? tNear : tFar;
    if (best && t >= best.t) continue;
    let nx = 0;
    let ny = 0;
    if (tx0 > ty0) nx = dx > 0 ? -1 : 1;
    else ny = dy > 0 ? -1 : 1;
    best = { t, nx, ny, rect: r };
  }
  return best;
}

/**
 * One random walk from an empty-space point: follow a random direction,
 * bounce diffusely (cosine-weighted around the normal), and return the
 * emission found, attenuated by every surface color touched on the way —
 * which is exactly where color bleeding comes from.
 */
function tracePath(startX: number, startY: number, out: [number, number, number]): void {
  let px = startX;
  let py = startY;
  const a0 = Math.random() * Math.PI * 2;
  let dx = Math.cos(a0);
  let dy = Math.sin(a0);
  let tr = 1;
  let tg = 1;
  let tb = 1;
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const hit = intersect(px, py, dx, dy);
    if (!hit) return;
    const e = hit.rect.emission;
    if (e[0] > 0 || e[1] > 0 || e[2] > 0) {
      out[0] = tr * e[0];
      out[1] = tg * e[1];
      out[2] = tb * e[2];
      return;
    }
    const al = hit.rect.albedo;
    tr *= al[0];
    tg *= al[1];
    tb *= al[2];
    // Cosine-weighted diffuse bounce in 2D: angle off the normal ∝ cos θ.
    const theta = Math.asin(2 * Math.random() - 1);
    const na = Math.atan2(hit.ny, hit.nx) + theta;
    px += dx * hit.t + hit.nx * EPS * 8;
    py += dy * hit.t + hit.ny * EPS * 8;
    dx = Math.cos(na);
    dy = Math.sin(na);
  }
}

export default function PathTracer(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<DemoState>({ ...INITIAL });
  const apiRef = useRef<{ ensureLoop: () => void; reset: () => void } | null>(null);
  const [state, setState] = useState<DemoState>({ ...INITIAL });
  const [spp, setSpp] = useState(0);

  // Mirror state into a ref so the RAF loop reads fresh values; (re)start the
  // loop when running flips on.
  useEffect(() => {
    stateRef.current = state;
    if (state.running) apiRef.current?.ensureLoop();
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas not supported");

    // Low-res accumulation target, blitted to the visible canvas.
    const buffer = document.createElement("canvas");
    buffer.width = RES_W;
    buffer.height = RES_H;
    const bctx = buffer.getContext("2d");
    if (!bctx) throw new Error("2D canvas not supported");
    const image = bctx.createImageData(RES_W, RES_H);

    const accum = new Float32Array(RES_W * RES_H * 3);
    const counts = new Uint32Array(RES_W * RES_H);
    // Solid pixels show their material directly; only empty space integrates.
    const solid = new Int8Array(RES_W * RES_H); // 0 empty, 1 solid, 2 emitter
    const solidColor = new Float32Array(RES_W * RES_H * 3);
    for (let y = 0; y < RES_H; y++) {
      for (let x = 0; x < RES_W; x++) {
        const i = y * RES_W + x;
        for (const r of SCENE) {
          if (!insideRect(r, x + 0.5, y + 0.5)) continue;
          const emissive = r.emission[0] > 0;
          solid[i] = emissive ? 2 : 1;
          solidColor[i * 3] = emissive ? 1 : r.albedo[0] * 0.4;
          solidColor[i * 3 + 1] = emissive ? 1 : r.albedo[1] * 0.4;
          solidColor[i * 3 + 2] = emissive ? 0.92 : r.albedo[2] * 0.4;
          break;
        }
      }
    }

    let raf = 0;
    let running = false;
    let cursor = 0; // next pixel index to sample — the loop is chunked

    const sample: [number, number, number] = [0, 0, 0];
    const accumulate = (): void => {
      const paths = stateRef.current.pathsPerFrame;
      const start = performance.now();
      const total = RES_W * RES_H;
      for (let n = 0; n < total; n++) {
        const i = cursor;
        cursor = (cursor + 1) % total;
        if (solid[i] === 0) {
          const x = (i % RES_W) + 0.5;
          const y = Math.floor(i / RES_W) + 0.5;
          for (let p = 0; p < paths; p++) {
            tracePath(x, y, sample);
            accum[i * 3] += sample[0];
            accum[i * 3 + 1] += sample[1];
            accum[i * 3 + 2] += sample[2];
          }
          counts[i] += paths;
        }
        // Stay inside the per-frame time budget; resume here next frame.
        if ((n & 255) === 255 && performance.now() - start > FRAME_BUDGET_MS) break;
      }
    };

    const present = (): void => {
      const data = image.data;
      for (let i = 0; i < RES_W * RES_H; i++) {
        let r: number;
        let g: number;
        let b: number;
        if (solid[i] !== 0) {
          r = solidColor[i * 3];
          g = solidColor[i * 3 + 1];
          b = solidColor[i * 3 + 2];
        } else {
          const n = counts[i] || 1;
          // Mean of all samples, filmic-ish tone map, gamma for display.
          r = 1 - Math.exp((-accum[i * 3] / n) * EXPOSURE);
          g = 1 - Math.exp((-accum[i * 3 + 1] / n) * EXPOSURE);
          b = 1 - Math.exp((-accum[i * 3 + 2] / n) * EXPOSURE);
          r = Math.pow(r, 1 / 2.2);
          g = Math.pow(g, 1 / 2.2);
          b = Math.pow(b, 1 / 2.2);
        }
        data[i * 4] = Math.min(255, Math.round(r * 255));
        data[i * 4 + 1] = Math.min(255, Math.round(g * 255));
        data[i * 4 + 2] = Math.min(255, Math.round(b * 255));
        data[i * 4 + 3] = 255;
      }
      bctx.putImageData(image, 0, 0);

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
      ctx.fillStyle = "#14181f";
      ctx.fillRect(0, 0, w, h);
      // Letterbox to keep the 3:2 buffer aspect; nearest-neighbor keeps it crisp.
      const scale = Math.min(w / RES_W, h / RES_H);
      const dw = RES_W * scale;
      const dh = RES_H * scale;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(buffer, (w - dw) / 2, (h - dh) / 2, dw, dh);
    };

    const reportSpp = (): void => {
      let sum = 0;
      let n = 0;
      for (let i = 0; i < counts.length; i++) {
        if (solid[i] === 0) {
          sum += counts[i];
          n++;
        }
      }
      const avg = n === 0 ? 0 : Math.floor(sum / n);
      setSpp((prev) => (prev === avg ? prev : avg));
    };

    const tick = (): void => {
      if (stateRef.current.running) {
        accumulate();
        present();
        reportSpp();
        raf = requestAnimationFrame(tick);
      } else {
        running = false;
      }
    };

    const ensureLoop = (): void => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };

    const reset = (): void => {
      accum.fill(0);
      counts.fill(0);
      cursor = 0;
      setSpp(0);
      present();
    };

    apiRef.current = { ensureLoop, reset };

    const resizeObserver = new ResizeObserver(() => present());
    resizeObserver.observe(canvas);

    present();
    if (stateRef.current.running) ensureLoop();

    return () => {
      cancelAnimationFrame(raf);
      running = false;
      resizeObserver.disconnect();
      apiRef.current = null;
    };
  }, []);

  const caption = state.running
    ? `Tracing… ${spp} samples per pixel so far. Each frame fires ${state.pathsPerFrame} random path${state.pathsPerFrame === 1 ? "" : "s"} per pixel and averages them in — the speckle is unconverged Monte Carlo noise, and watching it melt away is the lesson. Note the red and green bleeding onto nearby surfaces.`
    : spp === 0
      ? "Paused before any samples. Switch Running on to start firing random light paths — the image will begin as pure noise and converge toward a clean solution."
      : `Paused at ${spp} samples per pixel. The remaining speckle is variance that only more samples can remove — switch Running back on to keep converging.`;

  const handleReset = (): void => {
    setState({ ...INITIAL });
    apiRef.current?.reset();
  };

  return (
    <PlaygroundFrame
      title="Progressive path tracing: noise that converges"
      caption={caption}
      onReset={handleReset}
      controls={
        <>
          <SwitchControl
            label="Running"
            checked={state.running}
            onChange={(running) => setState((s) => ({ ...s, running }))}
          />
          <SliderControl
            label="Paths per frame"
            value={state.pathsPerFrame}
            min={1}
            max={8}
            onInput={(pathsPerFrame) => setState((s) => ({ ...s, pathsPerFrame }))}
            format={(v) => `${v} / pixel`}
          />
        </>
      }
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        aria-label="Progressive 2D path tracer: a Cornell-box room rendered by random light paths, converging from noise to a clean image"
      />
    </PlaygroundFrame>
  );
}
