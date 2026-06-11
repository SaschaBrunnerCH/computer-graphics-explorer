import { useEffect, useRef, useState } from "react";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";

/**
 * Motion blur as honest integration: a ball orbits at constant speed, and
 * every displayed frame is composed from N snapshots taken across a virtual
 * shutter window (a fraction of a 1/24 s cinema frame, set by the shutter
 * angle). Each snapshot is alpha-accumulated additively, so the math really
 * is an average over the open-shutter interval — wide shutter = long smear,
 * 0° = frozen strobe, and too few samples shows up as ghost copies
 * (strobing) instead of a smooth streak.
 */

interface DemoState {
  shutterAngle: number; // degrees of the virtual frame the shutter stays open
  samples: number; // snapshots accumulated per displayed frame
  speed: number; // orbit speed in revolutions per second
  animate: boolean;
}

const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const INITIAL: DemoState = {
  shutterAngle: 180,
  samples: 16,
  speed: 0.6,
  animate: !prefersReducedMotion,
};

const VIRTUAL_FPS = 24; // the simulated camera runs at cinema rate
const START_ANGLE = -Math.PI / 2;

const COLOR_BG = "#0b0e14";
const COLOR_ORBIT = "rgba(148, 163, 184, 0.18)";
const COLOR_CENTER = "rgba(148, 163, 184, 0.5)";
const COLOR_BALL = "250, 204, 21"; // bright amber, alpha = 1/N per sample
const COLOR_TEXT = "rgba(226, 232, 240, 0.65)";

export default function MotionBlur(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<DemoState>({ ...INITIAL });
  const angleRef = useRef(START_ANGLE);
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

      const cx = w / 2;
      const cy = h / 2;
      const orbitR = Math.min(w, h) * 0.34;
      const ballR = Math.max(8, Math.min(w, h) * 0.045);

      // Orbit guide + pivot, so the path is readable even when frozen.
      ctx.strokeStyle = COLOR_ORBIT;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, orbitR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = COLOR_CENTER;
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();

      // The shutter stays open for (angle/360) of a virtual 1/24 s frame;
      // the ball sweeps `span` radians in that time. N snapshots are spread
      // across the window and added with weight 1/N — a true average, so the
      // total light is constant no matter how it is smeared.
      const shutterSec = s.shutterAngle / 360 / VIRTUAL_FPS;
      const span = s.speed * Math.PI * 2 * shutterSec;
      const n = s.samples;
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(${COLOR_BALL}, ${(1 / n).toFixed(4)})`;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n; // sample at sub-interval centers
        const a = angleRef.current - span * (1 - t); // window ends "now"
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * orbitR, cy + Math.sin(a) * orbitR, ballR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      ctx.fillStyle = COLOR_TEXT;
      ctx.font = "12px ui-monospace, monospace";
      ctx.fillText(
        `shutter open ${(shutterSec * 1000).toFixed(1)} ms of a ${(1000 / VIRTUAL_FPS).toFixed(1)} ms frame · ${n} sample${n > 1 ? "s" : ""}`,
        12,
        h - 14,
      );
    };

    const tick = (now: number): void => {
      const s = stateRef.current;
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      if (s.animate) angleRef.current += s.speed * Math.PI * 2 * dt;
      draw();
      if (s.animate) {
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

    const resizeObserver = new ResizeObserver(() => draw());
    resizeObserver.observe(canvas);

    if (stateRef.current.animate) ensureLoop();
    else draw();

    return () => {
      cancelAnimationFrame(raf);
      running = false;
      resizeObserver.disconnect();
      apiRef.current = null;
    };
  }, []);

  const strobing = state.samples <= 6 && state.shutterAngle >= 120;
  const caption =
    state.shutterAngle === 0
      ? "Shutter angle 0°: the shutter is open for no time at all, so every frame is a frozen, strobe-sharp ball — perfectly crisp, but the motion reads as choppy stop-motion."
      : strobing
        ? `Only ${state.samples} samples across a wide shutter: the integral is undersampled, so instead of a smooth smear you see ${state.samples} ghost copies — that stepping is the strobing artifact. Raise "Samples" to fix it.`
        : state.shutterAngle === 360
          ? "360° shutter: the virtual shutter stays open for the entire 1/24 s frame, so the ball smears across the whole arc it travels — maximum blur, smoothest motion."
          : `Each displayed frame averages ${state.samples} snapshots taken while the shutter is open (${((state.shutterAngle / 360 / VIRTUAL_FPS) * 1000).toFixed(1)} ms of a 1/24 s frame) — motion blur is nothing more than integrating the moving ball over that window.`;

  const handleReset = (): void => {
    angleRef.current = START_ANGLE;
    setState({ ...INITIAL });
    apiRef.current?.draw();
  };

  return (
    <PlaygroundFrame
      title="Motion blur is a shutter integral"
      caption={caption}
      onReset={handleReset}
      controls={
        <>
          <SliderControl
            label="Shutter angle"
            value={state.shutterAngle}
            min={0}
            max={360}
            step={5}
            onInput={(shutterAngle) => setState((s) => ({ ...s, shutterAngle }))}
            format={(v) => `${v}°`}
          />
          <SliderControl
            label="Samples"
            value={state.samples}
            min={1}
            max={32}
            onInput={(samples) => setState((s) => ({ ...s, samples }))}
          />
          <SliderControl
            label="Speed"
            value={state.speed}
            min={0.1}
            max={2}
            step={0.05}
            onInput={(speed) => setState((s) => ({ ...s, speed }))}
            format={(v) => `${v.toFixed(2)} rev/s`}
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
        className="h-full w-full"
        aria-label="Motion blur demo: a ball orbiting with adjustable shutter angle and sample count"
      />
    </PlaygroundFrame>
  );
}
