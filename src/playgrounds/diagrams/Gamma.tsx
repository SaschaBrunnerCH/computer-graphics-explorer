import { useEffect, useRef, useState } from "react";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";

/**
 * Gamma correction in three panels on one canvas, all drawn pixel-by-pixel
 * via ImageData so nothing gets resampled behind our back:
 *  (a) two black→white ramps — linear light stored raw vs gamma-encoded —
 *      with the physical 50% midpoint marked;
 *  (b) the classic check: a 1-device-pixel black/white checkerboard (which
 *      emits exactly 50% of the light) next to solid byte-128 gray and solid
 *      byte-188 gray (sRGB encoding of 0.5) — which one matches?
 *  (c) red + green blended in sRGB bytes (muddy dark band) vs blended in
 *      linear light and re-encoded (bright yellow) — the muddy-gradient bug.
 */

interface DemoState {
  gamma: number;
  blendLinear: boolean;
}

const INITIAL: DemoState = {
  gamma: 2.2,
  blendLinear: false,
};

/** Piecewise sRGB encode: linear light (0..1) → stored value (0..1). */
function srgbEncode(l: number): number {
  return l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
}

const SRGB_MID = Math.round(srgbEncode(0.5) * 255); // ≈ 188

const BG: [number, number, number] = [15, 18, 24];
const COLOR_TITLE = "#e2e8f0";
const COLOR_LABEL = "#94a3b8";
const COLOR_BORDER = "rgba(148, 163, 184, 0.45)";
const COLOR_MARKER = "rgba(255, 255, 255, 0.85)";

export default function Gamma(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<DemoState>({ ...INITIAL });
  const apiRef = useRef<{ draw: () => void } | null>(null);
  const [state, setState] = useState<DemoState>({ ...INITIAL });

  // Mirror state into a ref so draw() reads fresh values without re-running
  // the canvas setup effect; this demo is static, so just redraw on change.
  useEffect(() => {
    stateRef.current = state;
    apiRef.current?.draw();
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas not supported");

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

      // --- pixel-precise content via ImageData (device-pixel resolution) ---
      const img = ctx.createImageData(pw, ph);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = BG[0];
        d[i + 1] = BG[1];
        d[i + 2] = BG[2];
        d[i + 3] = 255;
      }

      const px = (v: number): number => Math.round(v * dpr);
      /** Fill a CSS-space rect column by column; colorAt(t) with t = 0..1 across the width. */
      const fillCols = (
        x: number,
        y: number,
        wc: number,
        hc: number,
        colorAt: (t: number) => [number, number, number],
      ): void => {
        const x0 = px(x);
        const y0 = px(y);
        const x1 = Math.min(px(x + wc), pw);
        const y1 = Math.min(px(y + hc), ph);
        for (let xx = x0; xx < x1; xx++) {
          const t = x1 - x0 <= 1 ? 0 : (xx - x0) / (x1 - 1 - x0);
          const [r, g, b] = colorAt(t);
          for (let yy = y0; yy < y1; yy++) {
            const i = (yy * pw + xx) * 4;
            d[i] = r;
            d[i + 1] = g;
            d[i + 2] = b;
          }
        }
      };
      /** 1-device-pixel black/white checkerboard — physically 50% of full white. */
      const fillChecker = (x: number, y: number, wc: number, hc: number): void => {
        const x0 = px(x);
        const y0 = px(y);
        const x1 = Math.min(px(x + wc), pw);
        const y1 = Math.min(px(y + hc), ph);
        for (let yy = y0; yy < y1; yy++) {
          for (let xx = x0; xx < x1; xx++) {
            const v = (xx + yy) & 1 ? 255 : 0;
            const i = (yy * pw + xx) * 4;
            d[i] = v;
            d[i + 1] = v;
            d[i + 2] = v;
          }
        }
      };

      const pad = 16;
      const cw = w - pad * 2;

      // Panel A — gradient ramps.
      const rampH = 28;
      const ramp1Y = 28;
      const ramp2Y = 78;
      fillCols(pad, ramp1Y, cw, rampH, (t) => {
        const v = Math.round(t * 255); // stored byte = linear light, no encoding
        return [v, v, v];
      });
      fillCols(pad, ramp2Y, cw, rampH, (t) => {
        const v = Math.round(Math.pow(t, 1 / s.gamma) * 255); // gamma-encoded
        return [v, v, v];
      });

      // Panel B — which gray is 50% light?
      const blockY = 156;
      const blockH = 62;
      const gap = 16;
      const bw = Math.min(150, (cw - gap * 2) / 3);
      const bx0 = pad;
      const bx1 = pad + bw + gap;
      const bx2 = pad + (bw + gap) * 2;
      fillChecker(bx0, blockY, bw, blockH);
      fillCols(bx1, blockY, bw, blockH, () => [128, 128, 128]);
      fillCols(bx2, blockY, bw, blockH, () => [SRGB_MID, SRGB_MID, SRGB_MID]);

      // Panel C — red + green blend.
      const barY = 268;
      const barH = 60;
      fillCols(pad, barY, cw, barH, (t) => {
        if (s.blendLinear) {
          // Mix in linear light, then encode for the display.
          return [Math.round(srgbEncode(1 - t) * 255), Math.round(srgbEncode(t) * 255), 0];
        }
        // Mix the stored sRGB bytes directly — the muddy-gradient bug.
        return [Math.round((1 - t) * 255), Math.round(t * 255), 0];
      });

      ctx.putImageData(img, 0, 0);

      // --- labels, borders and markers in CSS space on top ---
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";

      const title = (text: string, y: number): void => {
        ctx.fillStyle = COLOR_TITLE;
        ctx.font = "600 12px system-ui, sans-serif";
        ctx.fillText(text, pad, y);
      };
      const label = (text: string, x: number, y: number): void => {
        ctx.fillStyle = COLOR_LABEL;
        ctx.font = "11px system-ui, sans-serif";
        ctx.fillText(text, x, y);
      };
      const border = (x: number, y: number, wc: number, hc: number): void => {
        ctx.strokeStyle = COLOR_BORDER;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, wc - 1, hc - 1);
      };

      title("A · Black → white ramps", 20);
      label("raw linear bytes — midtones look too dark", pad, ramp1Y + rampH + 14);
      label(
        `γ = ${s.gamma.toFixed(2)} encoded — perceptually even steps`,
        pad,
        ramp2Y + rampH + 14,
      );
      border(pad, ramp1Y, cw, rampH);
      border(pad, ramp2Y, cw, rampH);

      // Midpoint marker: where 50% of the light lives on both ramps.
      const midX = Math.round(pad + cw / 2) + 0.5;
      ctx.strokeStyle = COLOR_MARKER;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(midX, ramp1Y - 6);
      ctx.lineTo(midX, ramp2Y + rampH + 4);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLOR_MARKER;
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText("midpoint: 50% light", midX + 5, ramp1Y - 10);

      title("B · Which gray emits 50% of the light?", 148);
      border(bx0, blockY, bw, blockH);
      border(bx1, blockY, bw, blockH);
      border(bx2, blockY, bw, blockH);
      label("1-px checker (true 50%)", bx0, blockY + blockH + 14);
      label("byte 128", bx1, blockY + blockH + 14);
      label(`byte ${SRGB_MID} = sRGB(0.5)`, bx2, blockY + blockH + 14);

      title("C · Blending red + green", 260);
      border(pad, barY, cw, barH);
      label(
        s.blendLinear
          ? "linear-light blend, then encoded — bright yellow (correct)"
          : "sRGB-byte blend — muddy dark middle (the bug)",
        pad,
        barY + barH + 14,
      );
    };

    apiRef.current = { draw };

    const resizeObserver = new ResizeObserver(() => draw());
    resizeObserver.observe(canvas);
    draw();

    return () => {
      resizeObserver.disconnect();
      apiRef.current = null;
    };
  }, []);

  const blendPart = state.blendLinear
    ? "Panel C now mixes red and green in linear light and re-encodes the result: a bright yellow midpoint, the physically correct blend."
    : "Panel C mixes the stored sRGB bytes directly, so the middle goes dark and muddy — this is the muddy-gradient bug.";
  const gammaPart =
    state.gamma < 1.4
      ? `At γ = ${state.gamma.toFixed(2)} the encoded ramp is nearly raw — midtones crush toward black, wasting bytes on highlights.`
      : `Panel B: the 1-px checker emits exactly 50% of the light — byte ${SRGB_MID} (sRGB-encoded 0.5) matches it, not byte 128, because stored values are gamma-encoded.`;
  const caption = `${gammaPart} ${blendPart}`;

  return (
    <PlaygroundFrame
      title="Gamma: bytes are not light"
      caption={caption}
      onReset={() => setState({ ...INITIAL })}
      controls={
        <>
          <SliderControl
            label="Gamma"
            value={state.gamma}
            min={1}
            max={3}
            step={0.05}
            onInput={(gamma) => setState((s) => ({ ...s, gamma }))}
            format={(v) => `γ = ${v.toFixed(2)}`}
          />
          <SwitchControl
            label="Blend in linear"
            checked={state.blendLinear}
            onChange={(blendLinear) => setState((s) => ({ ...s, blendLinear }))}
          />
        </>
      }
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        aria-label="Gamma correction demo: gradient ramps, the 50% gray checkerboard test, and color blending in sRGB versus linear"
      />
    </PlaygroundFrame>
  );
}
