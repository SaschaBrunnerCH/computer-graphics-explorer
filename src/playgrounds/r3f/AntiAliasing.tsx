import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SwitchControl } from "../../components/controls";

type Resolution = "0.5" | "1" | "2";

const INITIAL = { msaa: false, resolution: "1" as Resolution, rotate: true };

const RESOLUTION_OPTIONS = [
  { value: "0.5", label: "0.5×" },
  { value: "1", label: "1×" },
  { value: "2", label: "2×" },
] as const;

// Slightly off-axis angles — near-horizontal lines show stair-stepping best.
const BAR_ANGLES = [-8, -4, -1.5, 1.5, 4, 8] as const;

function makeStarGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  const points = 5;
  const outer = 1.3;
  const inner = 0.55;
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function Star({ rotate }: { rotate: boolean }): React.JSX.Element {
  const meshRef = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => makeStarGeometry(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    if (rotate && meshRef.current) meshRef.current.rotation.z += delta * 0.15;
  });

  return (
    <mesh ref={meshRef} geometry={geometry} position={[1.7, 0, 0]}>
      <meshBasicMaterial color="#ffd166" />
    </mesh>
  );
}

function buildCaption(msaa: boolean, resolution: Resolution, rotate: boolean): string {
  const res = {
    "0.5": "0.5× resolution makes every pixel huge, exaggerating the stair-step jaggies",
    "1": "At native 1× resolution thin edges break into visible stair-steps",
    "2": "2× resolution renders four samples per screen pixel and scales down — brute-force supersampling",
  }[resolution];
  const aa = msaa
    ? "hardware MSAA takes multiple coverage samples per pixel, smoothing polygon edges."
    : "with MSAA off, each pixel is fully in or out, so edges alias.";
  const crawl = rotate ? " Slow rotation makes the jaggies crawl — the most visible artifact." : "";
  return `${res}; ${aa}${crawl} FXAA and TAA are shader-based alternatives applied as post-processing (not shown live here).`;
}

export default function AntiAliasing(): React.JSX.Element {
  const [msaa, setMsaa] = useState(INITIAL.msaa);
  const [resolution, setResolution] = useState<Resolution>(INITIAL.resolution);
  const [rotate, setRotate] = useState(INITIAL.rotate);

  return (
    <PlaygroundFrame
      title="Aliasing and how anti-aliasing fights it"
      caption={buildCaption(msaa, resolution, rotate)}
      onReset={() => {
        setMsaa(INITIAL.msaa);
        setResolution(INITIAL.resolution);
        setRotate(INITIAL.rotate);
      }}
      controls={
        <>
          <SwitchControl label="MSAA (hardware)" checked={msaa} onChange={setMsaa} />
          <SegmentedControl
            label="Render resolution"
            options={RESOLUTION_OPTIONS}
            value={resolution}
            onChange={setResolution}
          />
          <SwitchControl label="Rotate slowly" checked={rotate} onChange={setRotate} />
        </>
      }
    >
      {/* The antialias flag is fixed at WebGL context creation, so toggling
          MSAA remounts the Canvas via the key. */}
      <Canvas
        key={String(msaa)}
        orthographic
        camera={{ position: [0, 0, 10], zoom: 70 }}
        dpr={Number(resolution)}
        gl={{ antialias: msaa }}
      >
        <color attach="background" args={["#0c0f14"]} />
        {BAR_ANGLES.map((deg, i) => (
          <mesh
            key={deg}
            position={[-1.5, 2.1 - i * 0.84, 0]}
            rotation={[0, 0, (deg * Math.PI) / 180]}
          >
            <planeGeometry args={[3.0, 0.05]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        ))}
        <Star rotate={rotate} />
      </Canvas>
    </PlaygroundFrame>
  );
}
