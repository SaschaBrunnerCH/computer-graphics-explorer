import { useEffect, useRef, useState } from "react";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl, SegmentedControl } from "../../components/controls";

/**
 * Raw WebGL2 on purpose: the whole lesson is the real pipeline with nothing
 * in between. Two nearly co-planar quads z-fight; the near-plane slider
 * redistributes depth precision and fixes it. The view modes show what the
 * depth buffer actually stores.
 */

const VERT = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aColor;
layout(location = 2) in float aLift;   // 1.0 on the stripe quad, lifted by uOffset
uniform mat4 uProj;
uniform mat4 uView;
uniform float uOffset;
out vec3 vColor;
void main() {
  vec3 p = aPos;
  p.y += uOffset * aLift;
  gl_Position = uProj * uView * vec4(p, 1.0);
  vColor = aColor;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vColor;
uniform float uNear;
uniform float uFar;
uniform int uViewMode; // 0 color, 1 raw depth, 2 linearized depth
out vec4 outColor;
void main() {
  if (uViewMode == 0) {
    outColor = vec4(vColor, 1.0);
  } else if (uViewMode == 1) {
    // What the depth buffer literally stores: non-linear, almost all ~1.0.
    float d = gl_FragCoord.z;
    outColor = vec4(vec3(d), 1.0);
  } else {
    // Undo the perspective mapping to get camera-space distance.
    float ndc = gl_FragCoord.z * 2.0 - 1.0;
    float linear = (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
    float g = clamp(linear / 45.0, 0.0, 1.0);
    outColor = vec4(vec3(g), 1.0);
  }
}`;

type ViewMode = "color" | "raw" | "linear";

interface DemoState {
  near: number;
  far: number;
  offsetMm: number;
  viewMode: ViewMode;
  animate: boolean;
}

const INITIAL: DemoState = {
  near: 0.01,
  far: 2000,
  offsetMm: 0,
  viewMode: "color",
  animate: true,
};

/* ---------- tiny matrix helpers (column-major, like WebGL expects) ---------- */

function perspective(fovYDeg: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan((fovYDeg * Math.PI) / 360);
  const nf = 1 / (near - far);
  // prettier-ignore
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function lookAt(eye: [number, number, number], target: [number, number, number]): Float32Array {
  const [ex, ey, ez] = eye;
  let zx = ex - target[0],
    zy = ey - target[1],
    zz = ez - target[2];
  const zl = Math.hypot(zx, zy, zz);
  zx /= zl;
  zy /= zl;
  zz /= zl;
  // up = (0,1,0)
  let xx = -zz,
    xz = zx;
  const xl = Math.hypot(xx, xz);
  xx /= xl;
  xz /= xl;
  const yx = zy * xz - 0,
    yy = zz * xx - zx * xz,
    yz = -zy * xx;
  // prettier-ignore
  return new Float32Array([
    xx, yx, zx, 0,
    0, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * ex + xz * ez), -(yx * ex + yy * ey + yz * ez), -(zx * ex + zy * ey + zz * ez), 1,
  ]);
}

/* ---------- geometry ---------- */

function buildScene(): Float32Array {
  const verts: number[] = [];
  const quad = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y: number,
    color: [number, number, number],
    lift: number,
  ): void => {
    const c = color;
    const p = [
      [x0, y, z0],
      [x1, y, z0],
      [x1, y, z1],
      [x0, y, z0],
      [x1, y, z1],
      [x0, y, z1],
    ];
    for (const [px, py, pz] of p) verts.push(px, py, pz, c[0], c[1], c[2], lift);
  };
  const box = (
    cx: number,
    cz: number,
    w: number,
    h: number,
    color: [number, number, number],
  ): void => {
    const x0 = cx - w / 2,
      x1 = cx + w / 2,
      z0 = cz - w / 2,
      z1 = cz + w / 2;
    const shade = (f: number): [number, number, number] => [
      color[0] * f,
      color[1] * f,
      color[2] * f,
    ];
    // top
    const top = shade(1);
    verts.push(
      ...[
        [x0, h, z0],
        [x1, h, z0],
        [x1, h, z1],
        [x0, h, z0],
        [x1, h, z1],
        [x0, h, z1],
      ].flatMap(([px, py, pz]) => [px, py, pz, top[0], top[1], top[2], 0]),
    );
    // four sides
    const sides: [number, number, number, number, number, number, number][] = [];
    const side = (ax: number, az: number, bx: number, bz: number, f: number): void => {
      const c = shade(f);
      sides.push(
        [ax, 0, az, c[0], c[1], c[2], 0],
        [bx, 0, bz, c[0], c[1], c[2], 0],
        [bx, h, bz, c[0], c[1], c[2], 0],
        [ax, 0, az, c[0], c[1], c[2], 0],
        [bx, h, bz, c[0], c[1], c[2], 0],
        [ax, h, az, c[0], c[1], c[2], 0],
      );
    };
    side(x0, z1, x1, z1, 0.85);
    side(x1, z1, x1, z0, 0.7);
    side(x1, z0, x0, z0, 0.55);
    side(x0, z0, x0, z1, 0.7);
    for (const v of sides) verts.push(...v);
  };

  // Ground
  quad(-14, -60, 14, 6, -0.001, [0.16, 0.19, 0.23], 0);
  // Road (dark) and stripe (yellow) — deliberately co-planar at y = 0.
  quad(-2.5, -55, 2.5, 5, 0, [0.28, 0.3, 0.34], 0);
  quad(-0.45, -55, 0.45, 5, 0, [0.95, 0.78, 0.18], 1);
  // Pillars receding into the distance to show the depth gradient.
  for (let i = 0; i < 7; i++) {
    const z = -3 - i * 7;
    box(-3.6, z, 1.2, 1.5 + i * 0.4, [0.32, 0.55, 0.75]);
    box(3.6, z, 1.2, 1.1 + i * 0.5, [0.75, 0.42, 0.32]);
  }
  return new Float32Array(verts);
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

export default function DepthBuffer(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<DemoState>({ ...INITIAL });
  const [state, setState] = useState<DemoState>({ ...INITIAL });

  // Mirror state into a ref so the RAF loop reads fresh values without re-creating the GL setup.
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("WebGL2 not supported");

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? "program link failed");
    }

    const data = buildScene();
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const stride = 7 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * 4);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 6 * 4);
    const vertexCount = data.length / 7;

    const uProj = gl.getUniformLocation(program, "uProj");
    const uView = gl.getUniformLocation(program, "uView");
    const uOffset = gl.getUniformLocation(program, "uOffset");
    const uNear = gl.getUniformLocation(program, "uNear");
    const uFar = gl.getUniformLocation(program, "uFar");
    const uViewMode = gl.getUniformLocation(program, "uViewMode");

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    let raf = 0;
    let t = 0;
    const draw = (): void => {
      const s = stateRef.current;
      const dpr = Math.min(window.devicePixelRatio, 2);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.clearColor(0.08, 0.09, 0.11, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      if (s.animate) t += 0.01;
      const eye: [number, number, number] = [Math.sin(t) * 1.2, 2.2 + Math.sin(t * 0.7) * 0.2, 7];

      gl.useProgram(program);
      gl.uniformMatrix4fv(uProj, false, perspective(55, w / h, s.near, s.far));
      gl.uniformMatrix4fv(uView, false, lookAt(eye, [0, 0.4, -12]));
      gl.uniform1f(uOffset, s.offsetMm / 1000);
      gl.uniform1f(uNear, s.near);
      gl.uniform1f(uFar, s.far);
      gl.uniform1i(uViewMode, s.viewMode === "color" ? 0 : s.viewMode === "raw" ? 1 : 2);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, vertexCount);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      // No loseContext() here: StrictMode remounts reuse the same canvas, and a
      // lost context would survive into the second mount. GPU objects are freed
      // explicitly; the context itself goes away with the canvas element.
      cancelAnimationFrame(raf);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    };
  }, []);

  const fighting = state.offsetMm < 1 && state.near < 0.5;
  const caption =
    state.viewMode === "raw"
      ? "Raw depth-buffer contents: almost everything is ~1.0 (white). Perspective squeezes most precision into the first few meters — that's why the far scene flickers."
      : state.viewMode === "linear"
        ? "Linearized depth: dark = near, light = far. This is the distance the raw values encode so unevenly."
        : fighting
          ? "The yellow stripe and the road share the same depth — watch them flicker (z-fighting). Fix it: raise the near plane, or lift the stripe a few millimeters."
          : "No more flicker: the depth buffer can now tell the two surfaces apart. Drop the near plane back to 0.01 to break it again.";

  return (
    <PlaygroundFrame
      title="The depth buffer, live and breakable"
      caption={caption}
      onReset={() => setState({ ...INITIAL })}
      controls={
        <>
          <SliderControl
            label="Near plane"
            value={state.near}
            min={0.01}
            max={2}
            step={0.01}
            onInput={(near) => setState((s) => ({ ...s, near }))}
            format={(v) => v.toFixed(2)}
          />
          <SliderControl
            label="Far plane"
            value={state.far}
            min={50}
            max={5000}
            step={50}
            onInput={(far) => setState((s) => ({ ...s, far }))}
          />
          <SliderControl
            label="Lift stripe (mm)"
            value={state.offsetMm}
            min={0}
            max={20}
            step={0.5}
            onInput={(offsetMm) => setState((s) => ({ ...s, offsetMm }))}
            format={(v) => `${v} mm`}
          />
          <SegmentedControl<ViewMode>
            label="View"
            value={state.viewMode}
            options={[
              { value: "color", label: "Scene" },
              { value: "raw", label: "Raw z" },
              { value: "linear", label: "Linear z" },
            ]}
            onChange={(viewMode) => setState((s) => ({ ...s, viewMode }))}
          />
          <SwitchControl
            label="Camera sway"
            checked={state.animate}
            onChange={(animate) => setState((s) => ({ ...s, animate }))}
          />
        </>
      }
    >
      <canvas ref={canvasRef} className="h-full w-full" aria-label="WebGL2 depth buffer demo" />
    </PlaygroundFrame>
  );
}
