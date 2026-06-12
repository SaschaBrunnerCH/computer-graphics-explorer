import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl, SwitchControl } from "../../components/controls";

/**
 * Why draw calls matter: the same field of cubes drawn three ways. One mesh
 * per cube pays CPU driver overhead N times per frame; merging bakes
 * everything into one static buffer (one call, frozen transforms); instancing
 * keeps one call while every cube still has its own editable matrix + color.
 * The live draw-call counter from gl.info.render.calls is the money shot.
 */

type Strategy = "one-each" | "merged" | "instanced";

const INITIAL = { count: 4000, strategy: "one-each" as Strategy, spin: false };

/** "One mesh each" would make the tab crawl at 8000 — cap that mode honestly. */
const ONE_EACH_CAP = 2000;
const FIELD_HALF = 24;

const STRATEGY_OPTIONS = [
  { value: "one-each", label: "One mesh each" },
  { value: "merged", label: "Merged" },
  { value: "instanced", label: "Instanced" },
] as const;

const PALETTE = ["#5fb4e8", "#e0764f", "#ffd166", "#7bc96f", "#b07fe8", "#5fe0c8"] as const;

const WHY: Record<Strategy, string> = {
  "one-each":
    "every cube is its own mesh, so the CPU re-validates state and issues a separate driver call per cube — overhead scales with N",
  merged:
    "all cubes are baked into one big static geometry: a single call, but the transforms are frozen — moving one cube means rebuilding the whole buffer",
  instanced:
    "one InstancedMesh repeats the cube N times on the GPU: a single call, yet every instance keeps its own editable matrix and color",
};

interface CubeTransform {
  position: [number, number, number];
  rotationY: number;
  scale: number;
  paletteIndex: number;
  matrix: THREE.Matrix4;
}

/** Deterministic LCG placement so every rebuild lands the cubes in the same spots. */
function buildTransforms(count: number): CubeTransform[] {
  let seed = 20260612;
  const rand = (): number => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const euler = new THREE.Euler();
  const out: CubeTransform[] = [];
  for (let i = 0; i < count; i += 1) {
    const scale = 0.25 + rand() * 0.35;
    const x = (rand() - 0.5) * 2 * FIELD_HALF;
    const z = (rand() - 0.5) * 2 * FIELD_HALF;
    const rotationY = rand() * Math.PI * 2;
    pos.set(x, scale / 2, z);
    quat.setFromEuler(euler.set(0, rotationY, 0));
    scl.setScalar(scale);
    out.push({
      position: [x, scale / 2, z],
      rotationY,
      scale,
      paletteIndex: Math.floor(rand() * PALETTE.length),
      matrix: new THREE.Matrix4().compose(pos, quat, scl),
    });
  }
  return out;
}

/** The cube field, rebuilt (with full disposal) whenever strategy or count changes. */
function Field({
  strategy,
  count,
  spin,
}: {
  strategy: Strategy;
  count: number;
  spin: boolean;
}): React.JSX.Element {
  const groupRef = useRef<THREE.Group>(null);
  const transforms = useMemo(() => buildTransforms(count), [count]);

  const baseGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  useEffect(() => () => baseGeometry.dispose(), [baseGeometry]);

  // "One mesh each": a small shared material palette — the point is N draw
  // calls from N meshes, not N materials.
  const paletteMaterials = useMemo(
    () => PALETTE.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.65 })),
    [],
  );
  useEffect(() => () => paletteMaterials.forEach((m) => m.dispose()), [paletteMaterials]);

  const mergedMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 }),
    [],
  );
  useEffect(() => () => mergedMaterial.dispose(), [mergedMaterial]);

  const instancedMaterial = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.65 }), []);
  useEffect(() => () => instancedMaterial.dispose(), [instancedMaterial]);

  // Merged: clone the unit cube per transform, bake the matrix into the
  // vertices, tag them with a per-cube color attribute, merge into one buffer.
  const mergedGeometry = useMemo(() => {
    if (strategy !== "merged") return null;
    const color = new THREE.Color();
    const parts = transforms.map((t) => {
      const part = baseGeometry.clone();
      part.applyMatrix4(t.matrix);
      color.set(PALETTE[t.paletteIndex]);
      const vertexCount = part.attributes.position.count;
      const colors = new Float32Array(vertexCount * 3);
      for (let i = 0; i < vertexCount; i += 1) color.toArray(colors, i * 3);
      part.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      return part;
    });
    const merged = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    return merged;
  }, [strategy, transforms, baseGeometry]);
  useEffect(() => () => mergedGeometry?.dispose(), [mergedGeometry]);

  // Instanced: one mesh, per-instance matrix + color.
  const instancedMesh = useMemo(() => {
    if (strategy !== "instanced") return null;
    const mesh = new THREE.InstancedMesh(baseGeometry, instancedMaterial, transforms.length);
    const color = new THREE.Color();
    transforms.forEach((t, i) => {
      mesh.setMatrixAt(i, t.matrix);
      mesh.setColorAt(i, color.set(PALETTE[t.paletteIndex]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere(); // instance-aware, so frustum culling stays correct
    return mesh;
  }, [strategy, transforms, baseGeometry, instancedMaterial]);
  // InstancedMesh.dispose() frees the instance buffers; geometry/material are shared.
  useEffect(() => () => instancedMesh?.dispose(), [instancedMesh]);

  useFrame((_, delta) => {
    if (spin && groupRef.current) groupRef.current.rotation.y += delta * 0.2;
  });
  useEffect(() => {
    if (!spin && groupRef.current) groupRef.current.rotation.y = 0;
  }, [spin]);

  return (
    <group ref={groupRef}>
      {strategy === "one-each" &&
        transforms.map((t, i) => (
          <mesh
            key={i}
            geometry={baseGeometry}
            material={paletteMaterials[t.paletteIndex]}
            position={t.position}
            rotation={[0, t.rotationY, 0]}
            scale={t.scale}
          />
        ))}
      {mergedGeometry && <mesh geometry={mergedGeometry} material={mergedMaterial} />}
      {instancedMesh && <primitive object={instancedMesh} />}
    </group>
  );
}

/**
 * Reads gl.info.render.calls (last frame's count) and a frame-rate estimate,
 * reporting them ~4×/s so the caption stays live without re-rendering React
 * every frame.
 */
function StatsProbe({
  onStats,
}: {
  onStats: (calls: number, fps: number) => void;
}): React.JSX.Element | null {
  const acc = useRef({ frames: 0, last: 0 });
  useFrame(({ gl }) => {
    const a = acc.current;
    const now = performance.now();
    if (a.last === 0) a.last = now;
    a.frames += 1;
    const elapsed = now - a.last;
    if (elapsed >= 250) {
      onStats(gl.info.render.calls, (a.frames * 1000) / elapsed);
      a.frames = 0;
      a.last = now;
    }
  });
  return null;
}

export default function Instancing(): React.JSX.Element {
  const [count, setCount] = useState(INITIAL.count);
  const [strategy, setStrategy] = useState<Strategy>(INITIAL.strategy);
  const [spin, setSpin] = useState(INITIAL.spin);
  const [stats, setStats] = useState({ calls: 0, fps: 0 });

  const handleStats = useCallback((calls: number, fps: number) => {
    const rounded = Math.round(fps);
    setStats((prev) =>
      prev.calls === calls && prev.fps === rounded ? prev : { calls, fps: rounded },
    );
  }, []);

  const effectiveCount = strategy === "one-each" ? Math.min(count, ONE_EACH_CAP) : count;
  const capNote =
    strategy === "one-each" && count > ONE_EACH_CAP
      ? ` (capped at ${ONE_EACH_CAP.toLocaleString()} of ${count.toLocaleString()} so the tab survives)`
      : "";
  const measured =
    stats.calls > 0 ? `Draw calls: ${stats.calls} · ~${stats.fps} fps` : "Draw calls: measuring…";
  const caption = `${measured} — ${effectiveCount.toLocaleString()} cubes${capNote}; ${WHY[strategy]}.`;

  return (
    <PlaygroundFrame
      title="One draw call or thousands"
      caption={caption}
      onReset={() => {
        setCount(INITIAL.count);
        setStrategy(INITIAL.strategy);
        setSpin(INITIAL.spin);
      }}
      controls={
        <>
          <SegmentedControl
            label="Strategy"
            options={STRATEGY_OPTIONS}
            value={strategy}
            onChange={setStrategy}
          />
          <SliderControl
            label="Object count"
            value={count}
            min={500}
            max={8000}
            step={100}
            onInput={setCount}
            format={(v) => v.toLocaleString()}
          />
          <SwitchControl label="Spin" checked={spin} onChange={setSpin} />
        </>
      }
    >
      <Canvas camera={{ position: [0, 26, 44], fov: 50, near: 0.5, far: 400 }} dpr={[1, 2]}>
        <color attach="background" args={["#171b21"]} />
        <ambientLight intensity={0.45} />
        <directionalLight position={[18, 30, 12]} intensity={1.6} />
        <Field strategy={strategy} count={effectiveCount} spin={spin} />
        <StatsProbe onStats={handleStats} />
        <OrbitControls enablePan={false} minDistance={8} maxDistance={150} />
      </Canvas>
    </PlaygroundFrame>
  );
}
