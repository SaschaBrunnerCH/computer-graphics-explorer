import { useEffect, useRef, useState } from "react";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";

/**
 * The same workload twice: N tiny triangles, transformed and drawn every
 * frame. The left lane does everything in JavaScript on the CPU — rotate each
 * vertex, then rasterize with an edge-function fill into a low-res pixel
 * buffer (work is chunked so the tab never locks; the image refreshes when a
 * full pass completes). The right lane hands the identical vertex buffer to
 * WebGL2 in a single draw call. The ms-per-image bars under each lane tell
 * the story: the CPU lane falls over an order of magnitude earlier, because
 * it is also doing the rasterization the GPU has dedicated silicon for.
 */

interface DemoState {
  count: number;
  animate: boolean;
}

const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const INITIAL: DemoState = {
  count: 4000,
  animate: !prefersReducedMotion,
};

const CPU_W = 192; // CPU lane's internal raster resolution (deliberately low)
const CPU_H = 144;
const CPU_BUDGET_MS = 12; // hard cap on CPU rasterization work per RAF frame
const SPIN_SPEED = 0.5; // rad/s field rotation when animating
const BUDGET_MS = 1000 / 60;
const BAR_MAX_MS = 60; // bar full-scale
const FLOATS_PER_VERTEX = 5; // x, y, r, g, b
const SEED = 0x9e3779b9;

const BG_RGB: [number, number, number] = [14, 18, 25]; // #0e1219, both lanes

const PALETTE: readonly [number, number, number][] = [
  [0.96, 0.62, 0.26],
  [0.36, 0.74, 0.97],
  [0.55, 0.85, 0.45],
  [0.94, 0.45, 0.55],
  [0.75, 0.55, 0.95],
  [0.98, 0.85, 0.37],
];

const VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec3 aColor;
uniform float uAngle;
out vec3 vColor;
void main() {
  float c = cos(uAngle);
  float s = sin(uAngle);
  gl_Position = vec4(c * aPos.x - s * aPos.y, s * aPos.x + c * aPos.y, 0.0, 1.0);
  vColor = aColor;
}`;

const FRAG = `#version 300 es
precision mediump float;
in vec3 vColor;
out vec4 outColor;
void main() { outColor = vec4(vColor, 1.0); }`;

/** Deterministic PRNG so reset reproduces the exact same field. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build the shared vertex set: N tiny triangles in clip space, interleaved
 * [x, y, r, g, b] per vertex. The CPU lane reads this array; the GPU lane
 * uploads the very same bytes as its one vertex buffer.
 */
function buildField(count: number): Float32Array {
  const rand = mulberry32(SEED);
  const data = new Float32Array(count * 3 * FLOATS_PER_VERTEX);
  let o = 0;
  for (let i = 0; i < count; i++) {
    const cx = (rand() * 2 - 1) * 0.92;
    const cy = (rand() * 2 - 1) * 0.92;
    const size = 0.018 + rand() * 0.022;
    const rot = rand() * Math.PI * 2;
    const base = PALETTE[Math.floor(rand() * PALETTE.length)];
    const tint = 0.7 + rand() * 0.3;
    for (let k = 0; k < 3; k++) {
      const a = rot + (k * Math.PI * 2) / 3;
      data[o++] = cx + Math.cos(a) * size;
      data[o++] = cy + Math.sin(a) * size;
      data[o++] = base[0] * tint;
      data[o++] = base[1] * tint;
      data[o++] = base[2] * tint;
    }
  }
  return data;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "shader compile failed");
  }
  return shader;
}

function msColor(ms: number): string {
  if (ms <= BUDGET_MS) return "#4ade80";
  if (ms <= BUDGET_MS * 2) return "#fbbf24";
  return "#f87171";
}

function MsBar({ label, ms }: { label: string; ms: number }): React.JSX.Element {
  const pct = Math.min(100, (ms / BAR_MAX_MS) * 100);
  const color = msColor(ms);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-8 shrink-0 text-[var(--calcite-color-text-3)]">{label}</span>
      <div className="relative h-3 min-w-0 flex-1 overflow-hidden rounded bg-[rgba(148,163,184,0.18)]">
        <div
          className="h-full rounded transition-[width] duration-200"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
        {/* 16.7 ms budget tick */}
        <div
          className="absolute top-0 h-full w-px bg-[rgba(226,232,240,0.6)]"
          style={{ left: `${(BUDGET_MS / BAR_MAX_MS) * 100}%` }}
        />
      </div>
      <span className="w-24 shrink-0 text-right tabular-nums" style={{ color }}>
        {ms > 0 ? `${ms.toFixed(1)} ms/image` : "…"}
      </span>
    </div>
  );
}

export default function GpuRace(): React.JSX.Element {
  const cpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<DemoState>({ ...INITIAL });
  const apiRef = useRef<{ reset: () => void } | null>(null);
  const [state, setState] = useState<DemoState>({ ...INITIAL });
  const [stats, setStats] = useState({ cpu: 0, gpu: 0 });

  // Mirror state into a ref so the RAF loop reads fresh values without re-running setup.
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const cpuCanvas = cpuCanvasRef.current;
    const glCanvas = glCanvasRef.current;
    if (!cpuCanvas || !glCanvas) return;

    /* ---------- CPU lane: 2D canvas + ImageData rasterizer ---------- */
    cpuCanvas.width = CPU_W;
    cpuCanvas.height = CPU_H;
    const ctx = cpuCanvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas not supported");

    const image = ctx.createImageData(CPU_W, CPU_H);
    const pix32 = new Uint32Array(image.data.buffer);
    const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
    const pack = (r: number, g: number, b: number): number =>
      littleEndian
        ? (255 << 24) | (b << 16) | (g << 8) | r
        : ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0;
    const bg32 = pack(BG_RGB[0], BG_RGB[1], BG_RGB[2]);
    pix32.fill(bg32);
    ctx.putImageData(image, 0, 0);

    /* ---------- GPU lane: WebGL2, one buffer, one draw call ---------- */
    const gl = glCanvas.getContext("webgl2");
    if (!gl) throw new Error("WebGL2 not supported");
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? "program link failed");
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    const stride = FLOATS_PER_VERTEX * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 2 * 4);
    const uAngle = gl.getUniformLocation(program, "uAngle");

    /* ---------- shared workload state ---------- */
    let field: Float32Array = new Float32Array(0);
    let builtCount = 0;
    let angle = 0;
    let raf = 0;
    let lastNow = performance.now();
    let lastStats = 0;

    // CPU pass bookkeeping: cursor + accumulated work time carried across frames.
    let cursor = 0;
    let passMs = 0;
    let passAngle = 0;
    let cpuEma = 0;
    let gpuEma = 0;

    const rebuild = (count: number): void => {
      field = buildField(count);
      builtCount = count;
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, field, gl.STATIC_DRAW);
      // Restart the CPU pass on the new field so timings stay comparable.
      cursor = 0;
      passMs = 0;
      passAngle = angle;
      cpuEma = 0;
      gpuEma = 0;
      pix32.fill(bg32);
    };

    apiRef.current = {
      reset: () => {
        angle = 0;
        cursor = 0;
        passMs = 0;
        cpuEma = 0;
        gpuEma = 0;
        pix32.fill(bg32);
      },
    };

    /** Rasterize triangles [from, to) into the pixel buffer — transform + edge-function fill, all in JS. */
    const rasterizeRange = (from: number, to: number, cos: number, sin: number): void => {
      const xs = [0, 0, 0];
      const ys = [0, 0, 0];
      for (let i = from; i < to; i++) {
        const o = i * 3 * FLOATS_PER_VERTEX;
        // Per-vertex transform (the "vertex shader", by hand).
        for (let k = 0; k < 3; k++) {
          const x = field[o + k * FLOATS_PER_VERTEX];
          const y = field[o + k * FLOATS_PER_VERTEX + 1];
          const rx = cos * x - sin * y;
          const ry = sin * x + cos * y;
          xs[k] = (rx * 0.5 + 0.5) * CPU_W;
          ys[k] = (0.5 - ry * 0.5) * CPU_H;
        }
        const color = pack(
          Math.round(field[o + 2] * 255),
          Math.round(field[o + 3] * 255),
          Math.round(field[o + 4] * 255),
        );
        // Bounding box, clamped to the buffer.
        const minX = Math.max(0, Math.floor(Math.min(xs[0], xs[1], xs[2])));
        const maxX = Math.min(CPU_W - 1, Math.ceil(Math.max(xs[0], xs[1], xs[2])));
        const minY = Math.max(0, Math.floor(Math.min(ys[0], ys[1], ys[2])));
        const maxY = Math.min(CPU_H - 1, Math.ceil(Math.max(ys[0], ys[1], ys[2])));
        if (minX > maxX || minY > maxY) continue;
        const area = (xs[1] - xs[0]) * (ys[2] - ys[0]) - (ys[1] - ys[0]) * (xs[2] - xs[0]);
        if (area === 0) continue;
        const sign = area > 0 ? 1 : -1;
        // Edge-function fill (the "rasterizer", by hand).
        for (let py = minY; py <= maxY; py++) {
          const sy = py + 0.5;
          const row = py * CPU_W;
          for (let px = minX; px <= maxX; px++) {
            const sx = px + 0.5;
            const w0 = (xs[1] - xs[0]) * (sy - ys[0]) - (ys[1] - ys[0]) * (sx - xs[0]);
            const w1 = (xs[2] - xs[1]) * (sy - ys[1]) - (ys[2] - ys[1]) * (sx - xs[1]);
            const w2 = (xs[0] - xs[2]) * (sy - ys[2]) - (ys[0] - ys[2]) * (sx - xs[2]);
            if (w0 * sign >= 0 && w1 * sign >= 0 && w2 * sign >= 0) {
              pix32[row + px] = color;
            }
          }
        }
      }
    };

    const tick = (now: number): void => {
      const s = stateRef.current;
      const dt = Math.min((now - lastNow) / 1000, 0.1);
      lastNow = now;
      if (s.count !== builtCount) rebuild(s.count);
      if (s.animate) angle += SPIN_SPEED * dt;

      /* --- CPU lane: chunked work under a 12 ms/frame budget --- */
      if (cursor === 0) {
        passAngle = angle; // snapshot so one image is internally consistent
        pix32.fill(bg32);
      }
      const cos = Math.cos(passAngle);
      const sin = Math.sin(passAngle);
      const chunkStart = performance.now();
      while (cursor < builtCount && performance.now() - chunkStart < CPU_BUDGET_MS) {
        const to = Math.min(cursor + 128, builtCount);
        rasterizeRange(cursor, to, cos, sin);
        cursor = to;
      }
      passMs += performance.now() - chunkStart;
      if (cursor >= builtCount) {
        // Full image done: present it and report how long the whole pass took.
        ctx.putImageData(image, 0, 0);
        cpuEma = cpuEma === 0 ? passMs : cpuEma * 0.8 + passMs * 0.2;
        cursor = 0;
        passMs = 0;
      }

      /* --- GPU lane: the identical buffer, one draw call --- */
      const t0 = performance.now();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const gw = Math.round(glCanvas.clientWidth * dpr);
      const gh = Math.round(glCanvas.clientHeight * dpr);
      if (gw > 0 && gh > 0 && (glCanvas.width !== gw || glCanvas.height !== gh)) {
        glCanvas.width = gw;
        glCanvas.height = gh;
      }
      gl.viewport(0, 0, glCanvas.width, glCanvas.height);
      gl.clearColor(BG_RGB[0] / 255, BG_RGB[1] / 255, BG_RGB[2] / 255, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1f(uAngle, angle);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, builtCount * 3);
      // finish() forces the GPU to complete so the timing is end-to-end honest
      // (without it we would only measure the cost of *submitting* the work).
      gl.finish();
      const gpuMs = performance.now() - t0;
      gpuEma = gpuEma === 0 ? gpuMs : gpuEma * 0.9 + gpuMs * 0.1;

      if (now - lastStats > 250) {
        lastStats = now;
        setStats({ cpu: cpuEma, gpu: gpuEma });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      // No loseContext() here: StrictMode remounts reuse the same canvas.
      // GL objects are freed explicitly; the context dies with the element.
      cancelAnimationFrame(raf);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
      apiRef.current = null;
    };
  }, []);

  const ratio = stats.cpu > 0 && stats.gpu > 0 ? stats.cpu / stats.gpu : 0;
  const caption =
    stats.cpu === 0
      ? "Measuring… both lanes render the identical set of triangles every frame."
      : `${state.count.toLocaleString()} triangles per image: CPU ${stats.cpu.toFixed(1)} ms vs GPU ${stats.gpu.toFixed(
          1,
        )} ms${ratio >= 2 ? ` — about ${Math.round(ratio)}× slower` : ""}. The CPU lane transforms AND rasterizes every triangle in JavaScript — exactly the per-pixel work the GPU has thousands of dedicated cores for — so it blows the 16.7 ms budget first and its image refreshes ever more rarely. WebGPU is WebGL's modern successor API (less driver overhead per draw, plus compute shaders), but this CPU-vs-GPU gap is the same story in both.`;

  const handleReset = (): void => {
    apiRef.current?.reset();
    setState({ ...INITIAL });
    setStats({ cpu: 0, gpu: 0 });
  };

  return (
    <PlaygroundFrame
      title="CPU vs GPU: the same triangles, two renderers"
      caption={caption}
      onReset={handleReset}
      controls={
        <>
          <SliderControl
            label="Triangles"
            value={state.count}
            min={500}
            max={20000}
            step={500}
            onInput={(count) => setState((s) => ({ ...s, count }))}
            format={(v) => v.toLocaleString()}
          />
          <SwitchControl
            label="Animate"
            checked={state.animate}
            onChange={(animate) => setState((s) => ({ ...s, animate }))}
          />
          <p className="m-0 text-xs leading-snug text-[var(--calcite-color-text-3)]">
            White tick on each bar = the 16.7 ms (60 fps) budget. The CPU lane is chunked to 12 ms
            of work per frame so the page stays responsive; its image only refreshes when a full
            pass finishes.
          </p>
        </>
      }
    >
      <div className="absolute inset-0 flex gap-3 p-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="m-0 text-xs font-semibold text-[var(--calcite-color-text-2)]">
            CPU — JavaScript transform + rasterize
          </p>
          <canvas
            ref={cpuCanvasRef}
            className="min-h-0 w-full flex-1 rounded border border-[var(--calcite-color-border-3)] [image-rendering:pixelated]"
            aria-label="CPU lane: triangles rasterized in JavaScript at low resolution"
          />
          <MsBar label="CPU" ms={stats.cpu} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="m-0 text-xs font-semibold text-[var(--calcite-color-text-2)]">
            GPU — WebGL2, one draw call
          </p>
          <canvas
            ref={glCanvasRef}
            className="min-h-0 w-full flex-1 rounded border border-[var(--calcite-color-border-3)]"
            aria-label="GPU lane: the same triangles drawn by WebGL2 in a single draw call"
          />
          <MsBar label="GPU" ms={stats.gpu} />
        </div>
      </div>
    </PlaygroundFrame>
  );
}
