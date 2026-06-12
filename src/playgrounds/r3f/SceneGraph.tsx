import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";

/**
 * Scene graph: a sun–planet–moon hierarchy plus a clickable tree in the
 * controls panel. Spinning a node's group carries everything below it —
 * transform inheritance made visible. "Detach moon" reparents the moon group
 * to the scene root with Object3D.attach (which preserves world position).
 */

type NodeId = "sun" | "planet" | "moon";

const INITIAL = {
  selected: "sun" as NodeId,
  speeds: { sun: 0.3, planet: 1.0, moon: 1.6 } as Record<NodeId, number>,
  detached: false,
  orbitLines: true,
};

const PLANET_DIST = 3.2;
const MOON_DIST = 1.1;

const NODE_INFO: Record<NodeId, { label: string; inherits: string }> = {
  sun: {
    label: "Sun",
    inherits: "rotating its group carries the planet and the moon — every descendant inherits it",
  },
  planet: {
    label: "Planet",
    inherits:
      "rotating its group carries the moon along but never touches the Sun — transforms only flow down the tree",
  },
  moon: {
    label: "Moon",
    inherits: "a leaf node — rotating its group spins only the moon itself",
  },
};

function circlePoints(radius: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  return points;
}

const PLANET_ORBIT = circlePoints(PLANET_DIST);
const MOON_ORBIT = circlePoints(MOON_DIST);

function SolarSystem({
  speeds,
  detached,
  orbitLines,
}: {
  speeds: Record<NodeId, number>;
  detached: boolean;
  orbitLines: boolean;
}): React.JSX.Element {
  const rootRef = useRef<THREE.Group>(null);
  const planetRef = useRef<THREE.Group>(null);
  const sunRef = useRef<THREE.Group>(null);
  const moonRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (sunRef.current) sunRef.current.rotation.y += delta * speeds.sun;
    if (planetRef.current) planetRef.current.rotation.y += delta * speeds.planet;
    if (moonRef.current) moonRef.current.rotation.y += delta * speeds.moon;
  });

  // Real reparenting: attach() keeps the moon's world transform while moving
  // it under the scene root. Reattaching snaps it back into its orbit slot so
  // Reset stays deterministic.
  useEffect(() => {
    const root = rootRef.current;
    const planet = planetRef.current;
    const moon = moonRef.current;
    if (!root || !planet || !moon) return;
    if (detached) {
      root.attach(moon);
    } else if (moon.parent !== planet) {
      planet.add(moon);
      moon.position.set(MOON_DIST, 0, 0);
      moon.rotation.set(0, 0, 0);
    }
  }, [detached]);

  return (
    <group ref={rootRef}>
      <group ref={sunRef}>
        <mesh>
          <sphereGeometry args={[0.8, 32, 20]} />
          <meshStandardMaterial color="#ffb347" emissive="#ff8c00" emissiveIntensity={1.6} />
        </mesh>
        <group ref={planetRef} position={[PLANET_DIST, 0, 0]}>
          <mesh>
            <icosahedronGeometry args={[0.42, 1]} />
            <meshStandardMaterial color="#4f9edb" flatShading />
          </mesh>
          <Line
            points={MOON_ORBIT}
            color="#5a6573"
            lineWidth={1}
            visible={orbitLines && !detached}
          />
          <group ref={moonRef} position={[MOON_DIST, 0, 0]}>
            <mesh>
              <icosahedronGeometry args={[0.18, 0]} />
              <meshStandardMaterial color="#c9d2dc" flatShading />
            </mesh>
          </group>
        </group>
      </group>
      <Line points={PLANET_ORBIT} color="#5a6573" lineWidth={1} visible={orbitLines} />
    </group>
  );
}

function TreeButton({
  label,
  depth,
  active,
  onSelect,
}: {
  label: string;
  depth: number;
  active: boolean;
  onSelect: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`block w-full rounded-md py-1 pr-2 text-left text-sm transition-colors ${
        active
          ? "bg-[var(--calcite-color-brand)] font-semibold text-white"
          : "text-[var(--calcite-color-text-2)] hover:bg-[var(--calcite-color-foreground-2)]"
      }`}
      style={{ paddingLeft: 8 + depth * 16 }}
    >
      {depth > 0 ? "└ " : ""}
      {label}
    </button>
  );
}

export default function SceneGraph(): React.JSX.Element {
  const [selected, setSelected] = useState<NodeId>(INITIAL.selected);
  const [speeds, setSpeeds] = useState<Record<NodeId, number>>({ ...INITIAL.speeds });
  const [detached, setDetached] = useState(INITIAL.detached);
  const [orbitLines, setOrbitLines] = useState(INITIAL.orbitLines);

  const info = NODE_INFO[selected];
  const caption = `Selected: ${info.label} — ${info.inherits}.${
    detached
      ? " The moon is reparented to the scene root (attach() kept its world position), so the planet and sun rotations no longer reach it."
      : ""
  }`;

  return (
    <PlaygroundFrame
      title="Scene graph: transforms flow downward"
      caption={caption}
      onReset={() => {
        setSelected(INITIAL.selected);
        setSpeeds({ ...INITIAL.speeds });
        setDetached(INITIAL.detached);
        setOrbitLines(INITIAL.orbitLines);
      }}
      controls={
        <>
          <div>
            <p className="mb-1 mt-0 text-sm font-medium text-[var(--calcite-color-text-1)]">
              Scene tree — click a node
            </p>
            <div className="flex flex-col gap-1 rounded-lg border border-[var(--calcite-color-border-3)] p-1">
              <TreeButton
                label="Sun"
                depth={0}
                active={selected === "sun"}
                onSelect={() => setSelected("sun")}
              />
              <TreeButton
                label="Planet"
                depth={1}
                active={selected === "planet"}
                onSelect={() => setSelected("planet")}
              />
              <TreeButton
                label={detached ? "Moon (→ root)" : "Moon"}
                depth={detached ? 0 : 2}
                active={selected === "moon"}
                onSelect={() => setSelected("moon")}
              />
            </div>
          </div>
          <SliderControl
            label={`Spin speed — ${info.label}`}
            value={speeds[selected]}
            min={0}
            max={3}
            step={0.1}
            onInput={(v) => setSpeeds((prev) => ({ ...prev, [selected]: v }))}
            format={(v) => `${v.toFixed(1)} rad/s`}
          />
          <SwitchControl label="Detach moon" checked={detached} onChange={setDetached} />
          <SwitchControl label="Orbit lines" checked={orbitLines} onChange={setOrbitLines} />
        </>
      }
    >
      <Canvas camera={{ position: [0, 5.5, 7], fov: 50 }} dpr={[1, 2]}>
        <color attach="background" args={["#14181d"]} />
        <ambientLight intensity={0.25} />
        <pointLight position={[0, 0, 0]} intensity={30} color="#ffe2b0" />
        <SolarSystem speeds={speeds} detached={detached} orbitLines={orbitLines} />
        <OrbitControls enablePan={false} minDistance={3} maxDistance={16} />
      </Canvas>
    </PlaygroundFrame>
  );
}
