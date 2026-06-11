import { useEffect, useRef, useState } from "react";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl } from "../../components/controls";

/**
 * A BRDF as a picture: a 2D cross-section of a surface, an incoming light
 * direction A, and the polar plot of "how much light leaves toward each
 * outgoing direction B". The lobe mixes a cosine-weighted diffuse hemisphere
 * with a GGX-flavored specular spike centered on the mirror direction.
 *
 * NOTE ON FIDELITY: this is deliberately illustrative, not radiometrically
 * exact — no Fresnel term, no geometry/shadowing term, hand-tuned energy
 * scaling so the shape change reads clearly. What IS kept correct: the lobe
 * is cosine-weighted (goes to zero along the surface), it peaks at the
 * mirror-reflection direction, low roughness = tight & bright, high
 * roughness = wide & dull, and metalness drains the diffuse base.
 */

interface DemoState {
  /** Incidence angle of the light in degrees from the surface normal; negative = from the left. */
  lightAngle: number;
  roughness: number;
  metalness: number;
}

const INITIAL: DemoState = {
  lightAngle: -45,
  roughness: 0.3,
  metalness: 0.1,
};

const MAX_ANGLE = 80; // keep the light off the horizon so the picture stays readable

const COLOR_BG = "#14181f";
const COLOR_SURFACE = "#8b97a8";
const COLOR_HATCH = "rgba(139, 151, 168, 0.35)";
const COLOR_NORMAL = "rgba(148, 163, 184, 0.6)";
const COLOR_LIGHT = "#fbbf24";
const COLOR_MIRROR = "rgba(251, 191, 36, 0.55)";
const COLOR_TEXT = "rgba(226, 232, 240, 0.85)";

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Direction for an angle measured from the surface normal (canvas coords, up = -y). */
function dirFromNormal(rad: number): { x: number; y: number } {
  return { x: Math.sin(rad), y: -Math.cos(rad) };
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - size * Math.cos(angle - 0.4), y - size * Math.sin(angle - 0.4));
  ctx.lineTo(x - size * Math.cos(angle + 0.4), y - size * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
}

export default function BrdfExplorer(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<DemoState>({ ...INITIAL });
  const apiRef = useRef<{ draw: () => void } | null>(null);
  const [state, setState] = useState<DemoState>({ ...INITIAL });

  // Mirror state into a ref and redraw — the scene is static, no RAF needed.
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
    // Surface point, kept in sync by draw() so pointer math matches the picture.
    let origin = { x: 0, y: 0 };
    let lightTip = { x: 0, y: 0 };

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

      const ox = w / 2;
      const oy = h * 0.8;
      origin = { x: ox, y: oy };
      const maxR = Math.min(oy - 28, w * 0.44);

      // Surface cross-section with hatching underneath.
      ctx.strokeStyle = COLOR_SURFACE;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, oy);
      ctx.lineTo(w, oy);
      ctx.stroke();
      ctx.strokeStyle = COLOR_HATCH;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 8; x < w; x += 16) {
        ctx.moveTo(x, oy + 3);
        ctx.lineTo(x - 9, oy + 13);
      }
      ctx.stroke();

      // Surface normal (dotted, straight up).
      ctx.strokeStyle = COLOR_NORMAL;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox, oy - maxR - 8);
      ctx.stroke();
      ctx.setLineDash([]);

      const thetaI = (s.lightAngle * Math.PI) / 180;
      const thetaR = -thetaI; // mirror-reflection direction

      /* ---- the lobe: diffuse hemisphere + GGX-flavored specular spike ---- */
      const a = Math.max(0.05, s.roughness);
      const a2 = a * a;
      const kd = 0.5 * (1 - s.metalness); // metals have (almost) no diffuse base
      // Hand-tuned energy trade: tighter lobe → longer spike ("tight & bright"),
      // rough lobe → shorter and wider ("wide & dull"). Illustrative only.
      const ks = (0.55 + 0.45 * s.metalness) * (1.6 - 1.1 * s.roughness);
      const lobeScale = maxR / 1.75;

      const brdf = (thetaO: number): number => {
        const cosO = Math.cos(thetaO);
        if (cosO <= 0) return 0;
        const cosD = Math.max(Math.cos(thetaO - thetaR), 0);
        const denom = cosD * cosD * (a2 - 1) + 1;
        const spike = (a2 * a2) / (denom * denom); // GGX-style, peak normalized to 1
        return (kd + ks * spike) * cosO; // cosine-weighted: zero along the surface
      };

      // Lobe brightness follows tightness: mirror-like = hot, chalk-like = dull.
      const t = 1 - s.roughness;
      const lr = Math.round(90 + 165 * t);
      const lg = Math.round(120 + 100 * t);
      const lb = Math.round(170 - 60 * t);
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      for (let deg = -89; deg <= 89; deg += 1) {
        const thetaO = (deg * Math.PI) / 180;
        const r = brdf(thetaO) * lobeScale;
        const d = dirFromNormal(thetaO);
        ctx.lineTo(ox + d.x * r, oy + d.y * r);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(${lr}, ${lg}, ${lb}, ${0.3 + 0.25 * t})`;
      ctx.fill();
      ctx.strokeStyle = `rgb(${lr}, ${lg}, ${lb})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Mirror-reflection direction: dashed reference line, where the spike peaks.
      const mr = dirFromNormal(thetaR);
      ctx.strokeStyle = COLOR_MIRROR;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + mr.x * maxR, oy + mr.y * maxR);
      ctx.stroke();
      ctx.setLineDash([]);

      // Incoming light: sun disc at A, arrow pointing at the surface point.
      const ld = dirFromNormal(thetaI);
      const lx = ox + ld.x * maxR;
      const ly = oy + ld.y * maxR;
      lightTip = { x: lx, y: ly };
      ctx.strokeStyle = COLOR_LIGHT;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(ox + ld.x * 14, oy + ld.y * 14);
      ctx.stroke();
      ctx.fillStyle = COLOR_LIGHT;
      drawArrowhead(ctx, ox + ld.x * 12, oy + ld.y * 12, Math.atan2(-ld.y, -ld.x), 11);
      ctx.beginPath();
      ctx.arc(lx, ly, 9, 0, Math.PI * 2);
      ctx.fill();

      // Labels.
      ctx.fillStyle = COLOR_TEXT;
      ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("A — incoming light (drag me)", lx, ly - 16);
      ctx.fillText("mirror direction", ox + mr.x * (maxR + 4), oy + mr.y * (maxR + 4) - 8);
      ctx.textAlign = "left";
      ctx.fillText("N", ox + 6, oy - maxR - 2);
      ctx.fillText("surface", 8, oy + 26);
      ctx.fillText("lobe: how much light leaves toward each direction B", 8, 18);
    };

    apiRef.current = { draw };

    const angleFromPointer = (e: PointerEvent): number => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const deg = (Math.atan2(px - origin.x, origin.y - py) * 180) / Math.PI;
      return clamp(Math.round(deg), -MAX_ANGLE, MAX_ANGLE);
    };

    const nearLight = (e: PointerEvent): boolean => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      return Math.hypot(px - lightTip.x, py - lightTip.y) < 26;
    };

    const onPointerDown = (e: PointerEvent): void => {
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      setState((s) => ({ ...s, lightAngle: angleFromPointer(e) }));
    };
    const onPointerMove = (e: PointerEvent): void => {
      if (!dragging) {
        canvas.style.cursor = nearLight(e) ? "grab" : "default";
        return;
      }
      canvas.style.cursor = "grabbing";
      setState((s) => ({ ...s, lightAngle: angleFromPointer(e) }));
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

  const shape =
    state.roughness <= 0.15
      ? " Near-mirror: almost all of it leaves in one tight, bright spike hugging the mirror direction."
      : state.roughness >= 0.85
        ? " Chalk-like: the answer is smeared across the whole hemisphere — wide and dull, mirror direction barely special."
        : " Glossy: a soft lobe around the mirror direction sitting on a diffuse base.";
  const metal =
    state.metalness >= 0.8 ? " High metalness has drained nearly all of the diffuse base." : "";
  const caption = `A BRDF answers one question — of the light arriving from A, how much bounces toward B?${shape}${metal}`;

  return (
    <PlaygroundFrame
      title="BRDF explorer — the shape of a bounce"
      caption={caption}
      onReset={() => setState({ ...INITIAL })}
      controls={
        <>
          <SliderControl
            label="Light angle"
            value={state.lightAngle}
            min={-MAX_ANGLE}
            max={MAX_ANGLE}
            step={1}
            onInput={(lightAngle) => setState((s) => ({ ...s, lightAngle }))}
            format={(v) => `${v}°`}
          />
          <SliderControl
            label="Roughness"
            value={state.roughness}
            min={0}
            max={1}
            step={0.01}
            onInput={(roughness) => setState((s) => ({ ...s, roughness }))}
            format={(v) => v.toFixed(2)}
          />
          <SliderControl
            label="Metalness"
            value={state.metalness}
            min={0}
            max={1}
            step={0.01}
            onInput={(metalness) => setState((s) => ({ ...s, metalness }))}
            format={(v) => v.toFixed(2)}
          />
        </>
      }
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none"
        aria-label="Polar plot of a reflectance lobe over a surface cross-section; drag to move the incoming light"
      />
    </PlaygroundFrame>
  );
}
