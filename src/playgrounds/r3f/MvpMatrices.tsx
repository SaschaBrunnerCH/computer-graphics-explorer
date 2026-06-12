import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl } from "../../components/controls";

/**
 * The M → V → P step-through: one little house, one fixed "game camera", and
 * a segmented control that re-renders the same scene from each space's point
 * of view. Model ignores the model matrix, World applies it, View renders
 * from the game camera's pose, and Clip applies the camera's actual
 * projection matrix to cloned geometry (applyMatrix4 performs the per-vertex
 * perspective divide), so the scene really lands inside the −1…+1 NDC cube.
 * The controls panel shows the active 4×4 matrix with changed cells lit up.
 */

type Space = "model" | "world" | "view" | "clip";

const INITIAL = { translateX: 1.2, rotateY: 30, scale: 1, space: "world" as Space };

const SPACE_OPTIONS = [
  { value: "model", label: "Model" },
  { value: "world", label: "World" },
  { value: "view", label: "View" },
  { value: "clip", label: "Clip" },
] as const;

const UP = new THREE.Vector3(0, 1, 0);
const UNIT_SCALE = new THREE.Vector3(1, 1, 1);

// The fixed game camera whose pose/projection supply the V and P matrices.
const GAME_FOV = 50;
const GAME_ASPECT = 16 / 9;
const GAME_NEAR = 1;
const GAME_FAR = 12;
const GAME_POSITION: [number, number, number] = [4, 2.5, 5.5];
const GAME_TARGET: [number, number, number] = [0, 0.6, 0];

const GAME_CAMERA = (() => {
  const cam = new THREE.PerspectiveCamera(GAME_FOV, GAME_ASPECT, GAME_NEAR, GAME_FAR);
  cam.position.set(...GAME_POSITION);
  cam.lookAt(...GAME_TARGET);
  cam.updateMatrixWorld(true); // also fills matrixWorldInverse (the view matrix)
  return cam;
})();

/** Frustum edge segments (point pairs) by unprojecting the NDC cube corners. */
const FRUSTUM_POINTS: THREE.Vector3[] = (() => {
  const corners: THREE.Vector3[] = [];
  for (const z of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const x of [-1, 1]) {
        corners.push(new THREE.Vector3(x, y, z).unproject(GAME_CAMERA));
      }
    }
  }
  const edges: [number, number][] = [
    [0, 1],
    [1, 3],
    [3, 2],
    [2, 0],
    [4, 5],
    [5, 7],
    [7, 6],
    [6, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  return edges.flatMap(([a, b]) => [corners[a], corners[b]]);
})();

interface HousePart {
  create: () => THREE.BufferGeometry;
  position: [number, number, number];
  rotationY: number;
  color: string;
}

const HOUSE_PARTS: readonly HousePart[] = [
  // walls
  {
    create: () => new THREE.BoxGeometry(1.3, 1, 1),
    position: [0, 0.5, 0],
    rotationY: 0,
    color: "#d9a05b",
  },
  // pyramid roof (4-sided cone, rotated to align with the walls)
  {
    create: () => new THREE.ConeGeometry(0.95, 0.75, 4),
    position: [0, 1.38, 0],
    rotationY: Math.PI / 4,
    color: "#c0533f",
  },
  // door on the +Z face, off-center so the rotation is readable
  {
    create: () => new THREE.BoxGeometry(0.3, 0.55, 0.12),
    position: [0.25, 0.28, 0.52],
    rotationY: 0,
    color: "#3f72c0",
  },
];

const CAMERA_BY_SPACE: Record<
  Space,
  { position: [number, number, number]; fov: number; near?: number; far?: number }
> = {
  model: { position: [2.6, 2.0, 3.4], fov: 45 },
  // Side-on vantage, framing both the house and the game-camera gizmo.
  world: { position: [14, 6, -6.5], fov: 45 },
  // View space: the r3f camera adopts the game camera's exact pose + lens.
  view: { position: GAME_POSITION, fov: GAME_FOV, near: GAME_NEAR, far: GAME_FAR },
  clip: { position: [2.4, 1.8, 3.2], fov: 45 },
};

const TARGET_BY_SPACE: Record<Space, [number, number, number]> = {
  model: [0, 0.7, 0],
  // Midpoint between the house and the game camera, so both stay in frame.
  world: [1.5, 1, 2.5],
  view: GAME_TARGET,
  clip: [0, 0, 0],
};

const CAPTIONS: Record<Space, string> = {
  model:
    "Model space: the house in its own local coordinates, origin at its feet. The sliders feed the model matrix shown beside — but it has not been applied yet.",
  world:
    "World space: the model matrix has translated, rotated and scaled the house into the shared scene. The yellow gizmo is the game camera whose view matrix comes next.",
  view: "View space: the same world seen through the game camera. The view matrix — the inverse of the camera's transform — puts the camera at the origin looking down −Z.",
  clip: "Clip space: the projection matrix squeezes the camera's frustum into the −1…+1 cube (yellow wireframe); after the perspective divide, near things grow and far things shrink. Slide the house out of the frustum and it leaves the cube — that geometry gets clipped.",
};

/** The house in its local frame; wrap in a transformed group for world placement. */
function House(): React.JSX.Element {
  const geometries = useMemo(() => HOUSE_PARTS.map((p) => p.create()), []);
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
  return (
    <>
      {HOUSE_PARTS.map((part, i) => (
        <mesh
          key={part.color}
          geometry={geometries[i]}
          position={part.position}
          rotation={[0, part.rotationY, 0]}
        >
          <meshStandardMaterial color={part.color} roughness={0.7} />
        </mesh>
      ))}
    </>
  );
}

function CameraGizmo(): React.JSX.Element {
  return (
    <>
      <group position={GAME_POSITION} quaternion={GAME_CAMERA.quaternion}>
        <mesh>
          <boxGeometry args={[0.55, 0.4, 0.8]} />
          <meshBasicMaterial color="#ffd166" />
        </mesh>
        <mesh position={[0, 0, -0.62]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.22, 0.45, 14]} />
          <meshBasicMaterial color="#ffd166" />
        </mesh>
      </group>
      <Line
        points={FRUSTUM_POINTS}
        segments
        color="#ffd166"
        lineWidth={1.5}
        transparent
        opacity={0.6}
      />
    </>
  );
}

/** Ground grid as plain line segments so it can be pushed through P·V too. */
function buildGroundLines(): THREE.BufferGeometry {
  const points: number[] = [];
  for (let i = -3; i <= 3; i += 1) {
    points.push(i, 0, -3, i, 0, 3);
    points.push(-3, 0, i, 3, 0, i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

/**
 * Clip-space view: clone every geometry and push it through P·V·M.
 * Vector3.applyMatrix4 divides by w, so the result is honest NDC geometry
 * inside the −1…+1 cube (all source vertices sit in front of the camera, so
 * the projective map keeps lines straight).
 */
function ClipScene({ modelMatrix }: { modelMatrix: THREE.Matrix4 }): React.JSX.Element {
  const geometries = useMemo(() => {
    const projView = new THREE.Matrix4().multiplyMatrices(
      GAME_CAMERA.projectionMatrix,
      GAME_CAMERA.matrixWorldInverse,
    );
    const local = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const offset = new THREE.Vector3();
    const houseParts = HOUSE_PARTS.map((part) => {
      const geometry = part.create();
      local.compose(
        offset.set(...part.position),
        quat.setFromAxisAngle(UP, part.rotationY),
        UNIT_SCALE,
      );
      const full = new THREE.Matrix4().multiplyMatrices(modelMatrix, local).premultiply(projView);
      geometry.applyMatrix4(full);
      return geometry;
    });
    const grid = buildGroundLines();
    grid.applyMatrix4(projView);
    return { houseParts, grid };
  }, [modelMatrix]);
  useEffect(
    () => () => {
      geometries.houseParts.forEach((g) => g.dispose());
      geometries.grid.dispose();
    },
    [geometries],
  );

  const ndcEdges = useMemo(() => {
    const box = new THREE.BoxGeometry(2, 2, 2);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    return edges;
  }, []);
  useEffect(() => () => ndcEdges.dispose(), [ndcEdges]);

  return (
    <>
      {geometries.houseParts.map((geometry, i) => (
        // Normals are meaningless after a projective warp, so flat unlit colors.
        <mesh key={HOUSE_PARTS[i].color} geometry={geometry}>
          <meshBasicMaterial color={HOUSE_PARTS[i].color} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <lineSegments geometry={geometries.grid}>
        <lineBasicMaterial color="#46566a" />
      </lineSegments>
      <lineSegments geometry={ndcEdges}>
        <lineBasicMaterial color="#ffd166" />
      </lineSegments>
    </>
  );
}

function formatCell(value: number): string {
  const clean = Math.abs(value) < 0.005 ? 0 : value;
  return clean.toFixed(2);
}

function sameValues(a: number[], b: number[]): boolean {
  return a.every((v, i) => Math.abs(v - b[i]) <= 0.005);
}

/** Monospace 4×4 readout; cells that changed since the last render light up. */
function MatrixReadout({
  label,
  matrix,
}: {
  label: string;
  matrix: THREE.Matrix4;
}): React.JSX.Element {
  // Row-major order for display (three stores elements column-major).
  const values: number[] = [];
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) values.push(matrix.elements[col * 4 + row]);
  }
  // Keep the previous matrix around to highlight cells the sliders changed —
  // the "adjust state during render" pattern, so no refs are read in render.
  const [history, setHistory] = useState<{ values: number[]; prev: number[] | null }>({
    values,
    prev: null,
  });
  if (!sameValues(history.values, values)) {
    setHistory({ values, prev: history.values });
  }
  const prev = history.prev;
  return (
    <div>
      <p className="m-0 mb-1 text-xs font-medium text-[var(--calcite-color-text-2)]">{label}</p>
      <div className="grid grid-cols-4 gap-x-2 gap-y-1 rounded border border-[var(--calcite-color-border-3)] bg-[var(--calcite-color-foreground-2)] p-2 text-right font-mono text-xs tabular-nums">
        {values.map((value, i) => {
          const changed = prev !== null && Math.abs(value - prev[i]) > 0.005;
          return (
            <span
              key={i}
              className={
                changed
                  ? "font-bold text-[var(--calcite-color-brand)]"
                  : "text-[var(--calcite-color-text-2)]"
              }
            >
              {formatCell(value)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function MvpMatrices(): React.JSX.Element {
  const [translateX, setTranslateX] = useState(INITIAL.translateX);
  const [rotateY, setRotateY] = useState(INITIAL.rotateY);
  const [scale, setScale] = useState(INITIAL.scale);
  const [space, setSpace] = useState<Space>(INITIAL.space);

  const modelMatrix = useMemo(
    () =>
      new THREE.Matrix4().compose(
        new THREE.Vector3(translateX, 0, 0),
        new THREE.Quaternion().setFromAxisAngle(UP, (rotateY * Math.PI) / 180),
        new THREE.Vector3(scale, scale, scale),
      ),
    [translateX, rotateY, scale],
  );

  // The active matrix per space: M is shown both before (model) and after
  // (world) it is applied; V and P come straight from the game camera.
  const active = {
    model: { label: "Model matrix M · local → world (applied next)", matrix: modelMatrix },
    world: { label: "Model matrix M · local → world (just applied)", matrix: modelMatrix },
    view: {
      label: "View matrix V · world → view (camera's inverse transform)",
      matrix: GAME_CAMERA.matrixWorldInverse,
    },
    clip: {
      label: "Projection matrix P · view → clip",
      matrix: GAME_CAMERA.projectionMatrix,
    },
  }[space];

  const rotationRad = (rotateY * Math.PI) / 180;

  return (
    <PlaygroundFrame
      title="Model → View → Projection, one space at a time"
      caption={CAPTIONS[space]}
      stageHeight={520}
      onReset={() => {
        setTranslateX(INITIAL.translateX);
        setRotateY(INITIAL.rotateY);
        setScale(INITIAL.scale);
        setSpace(INITIAL.space);
      }}
      controls={
        <>
          <SegmentedControl
            label="Space"
            options={SPACE_OPTIONS}
            value={space}
            onChange={setSpace}
          />
          <SliderControl
            label="Translate X"
            value={translateX}
            min={-2.5}
            max={2.5}
            step={0.1}
            onInput={setTranslateX}
            format={(v) => v.toFixed(1)}
          />
          <SliderControl
            label="Rotate Y"
            value={rotateY}
            min={-180}
            max={180}
            step={1}
            onInput={setRotateY}
            format={(v) => `${v}°`}
          />
          <SliderControl
            label="Scale"
            value={scale}
            min={0.3}
            max={2}
            step={0.05}
            onInput={setScale}
            format={(v) => `${v.toFixed(2)}×`}
          />
          <MatrixReadout key={space} label={active.label} matrix={active.matrix} />
        </>
      }
    >
      {/* Remount per space so each gets its own honest camera setup. */}
      <Canvas
        key={space}
        camera={CAMERA_BY_SPACE[space]}
        dpr={[1, 2]}
        onCreated={({ camera }) => camera.lookAt(...TARGET_BY_SPACE[space])}
      >
        <color attach="background" args={["#171b21"]} />
        {space !== "clip" && (
          <>
            <ambientLight intensity={0.5} />
            <directionalLight position={[6, 9, 4]} intensity={1.5} />
          </>
        )}

        {space === "model" && (
          <>
            <House />
            <axesHelper args={[1.8]} />
          </>
        )}

        {(space === "world" || space === "view") && (
          <>
            <gridHelper args={[6, 6, "#3d4b5c", "#2b3543"]} />
            <axesHelper args={[1.2]} />
            <group position={[translateX, 0, 0]} rotation={[0, rotationRad, 0]} scale={scale}>
              <House />
            </group>
            {space === "world" && <CameraGizmo />}
          </>
        )}

        {space === "clip" && <ClipScene modelMatrix={modelMatrix} />}

        {/* In view space the camera pose IS the lesson, so no orbiting there. */}
        {space !== "view" && (
          <OrbitControls
            target={TARGET_BY_SPACE[space]}
            enablePan={false}
            minDistance={1.5}
            maxDistance={40}
          />
        )}
      </Canvas>
    </PlaygroundFrame>
  );
}
