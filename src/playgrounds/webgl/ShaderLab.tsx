import { useEffect, useRef, useState } from "react";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl } from "../../components/controls";

/**
 * A minimal live-GLSL lab on raw WebGL2: a fullscreen quad, a fixed vertex
 * shader, and an editable fragment shader compiled ~300 ms after each
 * keystroke. On error the LAST GOOD program keeps drawing and the driver's
 * real getShaderInfoLog text is shown — that error experience is the lesson:
 * a shader is an actual program, with an actual compiler.
 */

const VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

type PresetKey = "wave" | "plasma" | "rings";

const PRESETS: Record<PresetKey, string> = {
  wave: `#version 300 es
precision highp float;

in vec2 vUv;          // 0..1 across the canvas
uniform float uTime;   // seconds, ticked by the CPU every frame
uniform float uSlider; // the "uSlider uniform" control (0..1)
out vec4 outColor;

void main() {
  // Three phase-shifted sine waves, one per channel.
  // uSlider sets how many waves fit across the screen.
  float freq = 3.0 + uSlider * 14.0;
  float x = vUv.x * freq + uTime;
  float r = 0.5 + 0.5 * sin(x);
  float g = 0.5 + 0.5 * sin(x + 2.094);
  float b = 0.5 + 0.5 * sin(x + 4.188);
  outColor = vec4(r, g, b, 1.0);
}`,
  plasma: `#version 300 es
precision highp float;

in vec2 vUv;
uniform float uTime;
uniform float uSlider; // zoom: more slider = more plasma cells
out vec4 outColor;

void main() {
  vec2 p = vUv * (3.0 + uSlider * 9.0);
  float v = sin(p.x + uTime)
          + sin(p.y + uTime * 0.7)
          + sin(p.x + p.y + uTime * 0.4)
          + sin(length(p - 3.0) * 1.3 + uTime);
  vec3 col = 0.5 + 0.5 * cos(v + vec3(0.0, 2.1, 4.2));
  outColor = vec4(col, 1.0);
}`,
  rings: `#version 300 es
precision highp float;

in vec2 vUv;
uniform float uTime;
uniform float uSlider; // ring density
out vec4 outColor;

void main() {
  vec2 c = vUv - 0.5;
  float d = length(c);
  float rings = sin(d * (18.0 + uSlider * 90.0) - uTime * 2.5);
  float v = smoothstep(-0.2, 0.6, rings);
  vec3 deep = vec3(0.03, 0.09, 0.22);
  vec3 glow = vec3(0.35, 0.85, 1.0);
  outColor = vec4(mix(deep, glow, v), 1.0);
}`,
};

const PRESET_OPTIONS = [
  { value: "wave", label: "Color wave" },
  { value: "plasma", label: "Plasma" },
  { value: "rings", label: "Rings" },
] as const;

const INITIAL = {
  preset: "wave" as PresetKey,
  slider: 0.5,
};

interface GlApi {
  /** Compile + link a fragment source; returns the info log on failure, null on success. */
  compile: (src: string) => string | null;
}

export default function ShaderLab(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<GlApi | null>(null);
  const sliderRef = useRef(INITIAL.slider);
  const sourceRef = useRef(PRESETS[INITIAL.preset]);

  const [preset, setPreset] = useState<PresetKey>(INITIAL.preset);
  const [slider, setSlider] = useState(INITIAL.slider);
  const [source, setSource] = useState(PRESETS[INITIAL.preset]);
  const [error, setError] = useState<string | null>(null);

  // Mirror the slider into a ref so the RAF loop reads it without re-running GL setup.
  useEffect(() => {
    sliderRef.current = slider;
  }, [slider]);

  // Debounced compile: wait ~300 ms after the last keystroke, then hand the
  // source to the GL thread. On failure the last good program stays bound.
  useEffect(() => {
    sourceRef.current = source;
    const timer = window.setTimeout(() => {
      const api = apiRef.current;
      if (api) setError(api.compile(source));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [source]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("WebGL2 not supported");

    // Fixed vertex stage: one triangle large enough to cover the whole canvas.
    const vert = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vert, VERT);
    gl.compileShader(vert);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    interface ProgramInfo {
      program: WebGLProgram;
      uTime: WebGLUniformLocation | null;
      uSlider: WebGLUniformLocation | null;
    }
    let current: ProgramInfo | null = null;

    const compile = (src: string): string | null => {
      const frag = gl.createShader(gl.FRAGMENT_SHADER)!;
      gl.shaderSource(frag, src);
      gl.compileShader(frag);
      if (!gl.getShaderParameter(frag, gl.COMPILE_STATUS)) {
        // The real driver log — line:column references point into the textarea.
        const log = gl.getShaderInfoLog(frag) ?? "Shader compile failed (no log).";
        gl.deleteShader(frag);
        return log;
      }
      const program = gl.createProgram()!;
      gl.attachShader(program, vert);
      gl.attachShader(program, frag);
      gl.linkProgram(program);
      gl.detachShader(program, frag);
      gl.deleteShader(frag);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program) ?? "Program link failed (no log).";
        gl.deleteProgram(program);
        return log;
      }
      if (current) gl.deleteProgram(current.program);
      current = {
        program,
        uTime: gl.getUniformLocation(program, "uTime"),
        uSlider: gl.getUniformLocation(program, "uSlider"),
      };
      return null;
    };

    // First program right away (the debounced effect re-confirms it shortly after).
    compile(sourceRef.current);
    apiRef.current = { compile };

    let raf = 0;
    const start = performance.now();
    const draw = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (current) {
        gl.useProgram(current.program);
        gl.uniform1f(current.uTime, (performance.now() - start) / 1000);
        gl.uniform1f(current.uSlider, sliderRef.current);
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      } else {
        gl.clearColor(0.08, 0.09, 0.11, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      // No loseContext(): StrictMode remounts reuse the same canvas. Free the
      // GPU objects explicitly; the context dies with the canvas element.
      cancelAnimationFrame(raf);
      apiRef.current = null;
      if (current) gl.deleteProgram(current.program);
      gl.deleteShader(vert);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
    };
  }, []);

  const caption = error
    ? "The GPU driver rejected that program — the log below is the real getShaderInfoLog output, line numbers and all. The last shader that compiled keeps drawing; fix the source and it hot-swaps."
    : 'This little fragment program runs once per pixel, every frame. uTime ticks on the CPU, "uSlider uniform" is your slider — both are uploaded to the GPU as uniforms each frame. Edit the code: it recompiles as you type.';

  const applyPreset = (next: PresetKey): void => {
    setPreset(next);
    setSource(PRESETS[next]);
  };

  return (
    <PlaygroundFrame
      title="Shader lab — a tiny program per pixel"
      caption={caption}
      onReset={() => {
        setPreset(INITIAL.preset);
        setSource(PRESETS[INITIAL.preset]);
        setSlider(INITIAL.slider);
      }}
      controls={
        <>
          <SegmentedControl<PresetKey>
            label="Preset"
            options={PRESET_OPTIONS}
            value={preset}
            onChange={applyPreset}
          />
          <SliderControl
            label="uSlider uniform"
            value={slider}
            min={0}
            max={1}
            step={0.01}
            onInput={setSlider}
            format={(v) => v.toFixed(2)}
          />
        </>
      }
    >
      <div className="flex h-full flex-col md:flex-row">
        <div className="relative min-h-[140px] min-w-0 flex-1">
          <canvas
            ref={canvasRef}
            className="h-full w-full"
            aria-label="Live output of the fragment shader on a fullscreen quad"
          />
        </div>
        <div className="flex min-h-0 w-full flex-col border-t border-[var(--calcite-color-border-3)] md:w-[46%] md:border-l md:border-t-0">
          <label className="flex min-h-0 flex-1 flex-col">
            <span className="border-b border-white/10 bg-[#171c24] px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-[#8fa3b8]">
              Fragment shader — edit me
            </span>
            <textarea
              value={source}
              onChange={(e) => setSource(e.target.value)}
              // The editor must own the keyboard: don't let Ctrl+K & friends
              // reach the app's global shortcut handlers while typing GLSL.
              onKeyDown={(e) => e.stopPropagation()}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="min-h-0 w-full flex-1 resize-none bg-[#10141a] p-3 font-mono text-xs leading-relaxed text-[#d6e2ee] outline-none"
            />
          </label>
          {error !== null && (
            <div
              role="alert"
              className="max-h-32 shrink-0 overflow-y-auto border-t border-[#7f1d1d] bg-[#2a1215] px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap text-[#fda4af]"
            >
              {error}
            </div>
          )}
        </div>
      </div>
    </PlaygroundFrame>
  );
}
