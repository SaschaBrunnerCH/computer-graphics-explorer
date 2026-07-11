import { useEffect, useRef, useState } from "react";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl, SegmentedControl } from "../../components/controls";
import { formatZFightOffset, Z_FIGHT_OFFSET } from "../zFightControls";

/**
 * Raw WebGL2 on purpose: the whole lesson is the real pipeline with nothing
 * in between. Two co-planar quads expose the limits of a conventional depth
 * buffer. The controls update the real projection and lift uniforms; the
 * readout reports a sampled depth-step estimate instead of treating any
 * near-plane or offset threshold as a universal fix. The view modes show what
 * the depth buffer actually stores.
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
  offsetCm: number;
  viewMode: ViewMode;
  animate: boolean;
  orbitYaw: number;
  orbitPitch: number;
}

const CAMERA_TARGET: [number, number, number] = [0, 0.4, -12];
const INITIAL_ORBIT_PITCH = Math.atan2(1.8, 19);
const INITIAL_ORBIT_DISTANCE = Math.hypot(1.8, 19);
const CAMERA_PITCH_MIN = -1.3;
const CAMERA_PITCH_MAX = 1.3;
const CAMERA_DRAG_RADIANS_PER_PIXEL = 0.008;
const CAMERA_KEY_RADIANS = 0.06;
const CAMERA_SWAY_YAW = Math.asin(1.2 / INITIAL_ORBIT_DISTANCE);
const CAMERA_SWAY_PITCH = Math.asin(0.2 / INITIAL_ORBIT_DISTANCE);

const INITIAL: DemoState = {
  near: 0.01,
  far: 100,
  offsetCm: 0,
  viewMode: "color",
  animate: true,
  orbitYaw: 0,
  orbitPitch: INITIAL_ORBIT_PITCH,
};

/** A stable camera and three points used only for the explanatory readout. */
const REFERENCE_EYE: [number, number, number] = [0, 2.2, 7];
const REFERENCE_STRIPE_Z = [-35, -15, 5] as const;

interface DepthStepEstimate {
  min: number;
  max: number;
  sampleCount: number;
}

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
  // right = normalize(cross(up, view-z)); the opposite signs rotate the
  // rendered world upside down and make the road appear to hang overhead.
  let xx = zz,
    xz = -zx;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function orbitEye(yaw: number, pitch: number): [number, number, number] {
  const horizontalDistance = INITIAL_ORBIT_DISTANCE * Math.cos(pitch);
  return [
    CAMERA_TARGET[0] + Math.sin(yaw) * horizontalDistance,
    CAMERA_TARGET[1] + Math.sin(pitch) * INITIAL_ORBIT_DISTANCE,
    CAMERA_TARGET[2] + Math.cos(yaw) * horizontalDistance,
  ];
}

function viewSpaceZ(view: Float32Array, point: [number, number, number]): number {
  return view[2] * point[0] + view[6] * point[1] + view[10] * point[2] + view[14];
}

/** Returns a point's normalized window-depth value after the current projection. */
function windowDepth(
  projection: Float32Array,
  view: Float32Array,
  point: [number, number, number],
): number {
  const viewZ = viewSpaceZ(view, point);
  const clipZ = projection[10] * viewZ + projection[14];
  return (clipZ / -viewZ + 1) * 0.5;
}

/**
 * Estimate the number of stored depth values separating the road and stripe
 * at three visible distances. This is an analytic diagnostic for the current
 * conventional projection, not a promise about every rasterized pixel.
 */
function estimateDepthSteps(
  near: number,
  far: number,
  offsetCm: number,
  depthBits: number,
): DepthStepEstimate | null {
  const view = lookAt(REFERENCE_EYE, CAMERA_TARGET);
  const projection = perspective(55, 1, near, far);
  const storedValues = 2 ** depthBits - 1;
  const lift = offsetCm / 100;
  const steps: number[] = [];
  for (const z of REFERENCE_STRIPE_Z) {
    const roadPoint: [number, number, number] = [0, 0, z];
    const distance = -viewSpaceZ(view, roadPoint);
    if (distance < near || distance > far) continue;
    const roadDepth = windowDepth(projection, view, roadPoint);
    const stripeDepth = windowDepth(projection, view, [0, lift, z]);
    steps.push(Math.abs(stripeDepth - roadDepth) * storedValues);
  }
  if (steps.length === 0) return null;
  return { min: Math.min(...steps), max: Math.max(...steps), sampleCount: steps.length };
}

function formatDepthSteps(value: number): string {
  if (value === 0) return "0";
  if (value < 0.01) return value.toExponential(1);
  if (value < 10) return value.toFixed(2);
  return Math.round(value).toLocaleString();
}

function formatMeters(value: number): string {
  return value < 1 ? `${value.toFixed(2)} m` : `${value.toFixed(value < 10 ? 1 : 0)} m`;
}

function formatRatio(value: number): string {
  return value >= 1000 ? Math.round(value).toLocaleString() : value.toFixed(0);
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
  const [depthBits, setDepthBits] = useState<number | null>(null);

  // Mirror state into a ref so the RAF loop reads fresh values without re-creating the GL setup.
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("WebGL2 not supported");
    const reportedDepthBits = gl.getParameter(gl.DEPTH_BITS) as number;
    setDepthBits(reportedDepthBits > 0 ? reportedDepthBits : null);

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

    const updateManualCamera = (update: (s: DemoState) => Partial<DemoState>): void => {
      setState((s) => ({ ...s, animate: false, ...update(s) }));
    };

    let drag: { pointerId: number; clientX: number; clientY: number } | null = null;
    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      drag = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
      canvas.setPointerCapture(event.pointerId);
      canvas.focus({ preventScroll: true });
      canvas.style.cursor = "grabbing";
      updateManualCamera(() => ({}));
      event.preventDefault();
    };
    const onPointerMove = (event: PointerEvent): void => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - drag.clientX;
      const deltaY = event.clientY - drag.clientY;
      drag = { ...drag, clientX: event.clientX, clientY: event.clientY };
      updateManualCamera((s) => ({
        orbitYaw: s.orbitYaw - deltaX * CAMERA_DRAG_RADIANS_PER_PIXEL,
        orbitPitch: clamp(
          s.orbitPitch + deltaY * CAMERA_DRAG_RADIANS_PER_PIXEL,
          CAMERA_PITCH_MIN,
          CAMERA_PITCH_MAX,
        ),
      }));
      event.preventDefault();
    };
    const endDrag = (event: PointerEvent): void => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      drag = null;
      canvas.style.cursor = "grab";
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      switch (event.key) {
        case "ArrowLeft":
          updateManualCamera((s) => ({ orbitYaw: s.orbitYaw + CAMERA_KEY_RADIANS }));
          break;
        case "ArrowRight":
          updateManualCamera((s) => ({ orbitYaw: s.orbitYaw - CAMERA_KEY_RADIANS }));
          break;
        case "ArrowUp":
          updateManualCamera((s) => ({
            orbitPitch: clamp(
              s.orbitPitch - CAMERA_KEY_RADIANS,
              CAMERA_PITCH_MIN,
              CAMERA_PITCH_MAX,
            ),
          }));
          break;
        case "ArrowDown":
          updateManualCamera((s) => ({
            orbitPitch: clamp(
              s.orbitPitch + CAMERA_KEY_RADIANS,
              CAMERA_PITCH_MIN,
              CAMERA_PITCH_MAX,
            ),
          }));
          break;
        default:
          return;
      }
      event.preventDefault();
    };

    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("keydown", onKeyDown);

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
      const eye = orbitEye(
        s.orbitYaw + (s.animate ? Math.sin(t) * CAMERA_SWAY_YAW : 0),
        s.orbitPitch + (s.animate ? Math.sin(t * 0.7) * CAMERA_SWAY_PITCH : 0),
      );

      gl.useProgram(program);
      gl.uniformMatrix4fv(uProj, false, perspective(55, w / h, s.near, s.far));
      gl.uniformMatrix4fv(uView, false, lookAt(eye, CAMERA_TARGET));
      gl.uniform1f(uOffset, s.offsetCm / 100);
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
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endDrag);
      canvas.removeEventListener("pointercancel", endDrag);
      canvas.removeEventListener("keydown", onKeyDown);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    };
  }, []);

  const estimate =
    depthBits === null
      ? null
      : estimateDepthSteps(state.near, state.far, state.offsetCm, depthBits);
  const frustumSummary = `The visible range is ${formatMeters(state.near)}–${formatMeters(state.far)} (${formatRatio(state.far / state.near)}×).`;
  const precisionSummary =
    depthBits === null
      ? `${frustumSummary} This WebGL context did not report its depth-buffer precision.`
      : estimate === null
        ? `${frustumSummary} None of the centered reference points is inside this range.`
        : `${frustumSummary} At ${estimate.sampleCount} visible centered reference point${estimate.sampleCount === 1 ? "" : "s"}, this ${depthBits}-bit buffer gives ${formatDepthSteps(estimate.min)}–${formatDepthSteps(estimate.max)} stored depth steps for a ${formatZFightOffset(state.offsetCm)} lift.`;
  const caption =
    state.viewMode === "raw"
      ? `Raw depth-buffer contents: almost everything is ~1.0 (white). Perspective squeezes most precision into the first few meters. ${frustumSummary} Switch back to Scene for the sampled precision readout.`
      : state.viewMode === "linear"
        ? `Linearized depth: dark = near, light = far. This is the distance the raw values encode so unevenly. ${frustumSummary}`
        : state.offsetCm === 0
          ? `${precisionSummary} The yellow stripe and road are exactly co-planar, so their depths tie. The visible result can depend on rasterization and draw order; camera motion can expose z-fighting.`
          : estimate === null
            ? `${precisionSummary} This lift breaks the exact tie, but it is not a reliable fix without a precision measurement.`
            : estimate.min < 1
              ? `${precisionSummary} At least one reference point is below one stored depth step, so this lift is not a reliable fix: the surfaces can still quantize to the same depth.`
              : `${precisionSummary} These reference samples exceed one stored depth step. That indicates separation for those samples, not a guarantee for every point, distance, or viewing angle.`;

  return (
    <PlaygroundFrame
      title="The depth buffer, live and breakable"
      caption={caption}
      onReset={() => setState({ ...INITIAL })}
      controls={
        <>
          <output
            data-testid="depth-buffer-camera"
            data-mode={state.animate ? "sway" : "manual"}
            data-yaw={state.orbitYaw.toFixed(3)}
            data-pitch={state.orbitPitch.toFixed(3)}
            className="m-0 text-xs text-[var(--calcite-color-text-3)]"
            aria-live="polite"
          >
            {state.animate
              ? "Camera: sway. Drag to orbit; manual input pauses the sway."
              : "Camera: manual orbit. Reset restores the starting view."}
          </output>
          <SliderControl
            label="Near plane (m)"
            value={state.near}
            min={0.01}
            max={2}
            step={0.01}
            onInput={(near) => setState((s) => ({ ...s, near }))}
            format={formatMeters}
          />
          <SliderControl
            label="Far plane (m)"
            value={state.far}
            min={10}
            max={100}
            step={1}
            onInput={(far) => setState((s) => ({ ...s, far }))}
            format={formatMeters}
          />
          <output
            data-testid="depth-buffer-frustum"
            data-near={state.near}
            data-far={state.far}
            className="m-0 text-xs text-[var(--calcite-color-text-3)]"
            aria-live="polite"
          >
            {frustumSummary} This 10–100 m range fits the road scene: lower Far to 10 m to clip the
            distance, while 100 m contains it. Once Far is beyond the scene, changing it has much
            less precision effect than changing Near.
          </output>
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Near plane is the closest visible distance. Raising it removes nearby geometry but gives
            distant geometry much more depth precision. Far plane is the farthest visible distance;
            lowering it removes distant geometry and helps less. The near/far ratio is the main
            stress test here.
          </p>
          <SliderControl
            label="Lift stripe (cm)"
            value={state.offsetCm}
            min={Z_FIGHT_OFFSET.minCm}
            max={Z_FIGHT_OFFSET.maxCm}
            step={Z_FIGHT_OFFSET.stepCm}
            onInput={(offsetCm) => setState((s) => ({ ...s, offsetCm }))}
            format={formatZFightOffset}
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
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Keyboard: focus the scene, then use arrow keys to orbit. Camera distance stays fixed so
            Near and Far remain the only clipping and depth-precision controls. The precision
            estimate deliberately stays on its centered reference camera so manual inspection does
            not turn it into a universal claim.
          </p>
        </>
      }
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none cursor-grab focus:outline-none focus:ring-2 focus:ring-[var(--calcite-color-brand)]"
        aria-label="WebGL2 depth buffer demo. Drag or use arrow keys to orbit after focusing the scene. Camera distance stays fixed so Near and Far control clipping and depth precision."
        tabIndex={0}
      />
    </PlaygroundFrame>
  );
}
