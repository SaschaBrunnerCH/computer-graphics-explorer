import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, type RootState } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";

/**
 * The classic PBR chart: a 6x6 grid of spheres sweeping metalness across X
 * and roughness down Y. Environment lighting comes from a PMREM-filtered
 * RoomEnvironment (generated locally — no network fetch) attached as
 * scene.environment so metals have something to reflect.
 */

const INITIAL = { ibl: true, hue: 25, rotate: false };

const GRID = 6;
const SPACING = 1.18;
const RADIUS = 0.46;

function hueName(hue: number): string {
  if (hue < 15 || hue >= 330) return "red";
  if (hue < 45) return "orange";
  if (hue < 70) return "yellow";
  if (hue < 160) return "green";
  if (hue < 200) return "cyan";
  if (hue < 260) return "blue";
  return "purple";
}

function SphereGrid({ hue, rotate }: { hue: number; rotate: boolean }): React.JSX.Element {
  const groupRef = useRef<THREE.Group>(null);
  const color = new THREE.Color().setHSL(hue / 360, 0.75, 0.5);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = rotate
      ? groupRef.current.rotation.y + delta * 0.4
      : THREE.MathUtils.damp(groupRef.current.rotation.y, 0, 4, delta);
  });

  const cells: React.JSX.Element[] = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const metalness = col / (GRID - 1);
      const roughness = row / (GRID - 1);
      cells.push(
        <mesh
          key={`${row}-${col}`}
          position={[(col - (GRID - 1) / 2) * SPACING, ((GRID - 1) / 2 - row) * SPACING, 0]}
        >
          <sphereGeometry args={[RADIUS, 40, 28]} />
          <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
        </mesh>,
      );
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    whiteSpace: "nowrap",
    color: "var(--calcite-color-text-2)",
    pointerEvents: "none",
  };

  return (
    <group ref={groupRef}>
      {cells}
      <Html center position={[0, -((GRID - 1) / 2) * SPACING - 1.1, 0]}>
        <div style={labelStyle}>metalness 0 → 1</div>
      </Html>
      <Html center position={[-((GRID - 1) / 2) * SPACING - 1.1, 0, 0]}>
        <div style={{ ...labelStyle, transform: "rotate(90deg)" }}>roughness 0 → 1</div>
      </Html>
    </group>
  );
}

export default function PbrMaterials(): React.JSX.Element {
  const [ibl, setIbl] = useState(INITIAL.ibl);
  const [hue, setHue] = useState(INITIAL.hue);
  const [rotate, setRotate] = useState(INITIAL.rotate);

  // PMREM env map, baked once the renderer exists (Canvas onCreated) and
  // attached declaratively below — never fetched from the network.
  const [envMap, setEnvMap] = useState<THREE.Texture | null>(null);
  const targetRef = useRef<THREE.WebGLRenderTarget | null>(null);

  useEffect(() => {
    return () => {
      targetRef.current?.dispose();
      targetRef.current = null;
    };
  }, []);

  const bakeEnvironment = (state: RootState): void => {
    targetRef.current?.dispose(); // StrictMode remounts can re-create the GL root
    const pmrem = new THREE.PMREMGenerator(state.gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    room.dispose();
    pmrem.dispose();
    targetRef.current = target;
    setEnvMap(target.texture);
  };

  const caption = ibl
    ? `Thirty-six identical ${hueName(hue)} spheres — only metalness (→) and roughness (↓) differ. Top-left is gloss paint, top-right is mirror chrome, the bottom row is pure chalk.`
    : "Image-based lighting is off and only one directional light remains — watch the metal column go nearly black. Metals only show what they reflect, and now there is nothing to reflect.";

  return (
    <PlaygroundFrame
      title="PBR: the metalness–roughness grid"
      caption={caption}
      onReset={() => {
        setIbl(INITIAL.ibl);
        setHue(INITIAL.hue);
        setRotate(INITIAL.rotate);
      }}
      controls={
        <>
          <SwitchControl label="Image-based lighting" checked={ibl} onChange={setIbl} />
          <SliderControl
            label="Base color hue"
            value={hue}
            min={0}
            max={360}
            step={5}
            onInput={setHue}
            format={(v) => `${v}°`}
          />
          <SwitchControl label="Rotate" checked={rotate} onChange={setRotate} />
        </>
      }
    >
      <Canvas camera={{ position: [0, 0, 9.5], fov: 50 }} dpr={[1, 2]} onCreated={bakeEnvironment}>
        <color attach="background" args={["#181c21"]} />
        {ibl && envMap && <primitive object={envMap} attach="environment" />}
        <directionalLight position={[4, 6, 5]} intensity={1.6} />
        <SphereGrid hue={hue} rotate={rotate} />
        <OrbitControls enablePan={false} minDistance={4} maxDistance={16} />
      </Canvas>
    </PlaygroundFrame>
  );
}
