import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";

const INITIAL = { azimuth: 40, elevation: 45, detail: 16, metallic: false };

const MODELS = [
  { label: "Flat", description: "one normal per triangle" },
  { label: "Gouraud", description: "lighting at vertices, colors interpolated" },
  { label: "Phong", description: "lighting per pixel + specular" },
  { label: "PBR", description: "physically based, energy conserving" },
] as const;

function Spheres({ detail, metallic }: { detail: number; metallic: boolean }): React.JSX.Element {
  // One geometry shared by all four spheres so only the material differs.
  const geometry = useMemo(
    () => new THREE.SphereGeometry(0.85, detail, Math.max(6, Math.round(detail * 0.75))),
    [detail],
  );
  const materials = useMemo(
    () => [
      new THREE.MeshLambertMaterial({ color: "#e06b2d", flatShading: true }),
      new THREE.MeshLambertMaterial({ color: "#e06b2d" }),
      new THREE.MeshPhongMaterial({ color: "#e06b2d", shininess: 60 }),
      new THREE.MeshStandardMaterial({
        color: "#e06b2d",
        metalness: metallic ? 0.9 : 0.1,
        roughness: 0.35,
      }),
    ],
    [metallic],
  );

  return (
    <>
      {MODELS.map((model, i) => (
        <group key={model.label} position={[(i - 1.5) * 2.2, 0, 0]}>
          <mesh geometry={geometry} material={materials[i]} />
          <Html center position={[0, -1.45, 0]} style={{ pointerEvents: "none" }}>
            <div
              style={{
                fontSize: 12,
                width: 110,
                textAlign: "center",
                color: "var(--calcite-color-text-2)",
              }}
            >
              <strong>{model.label}</strong>
              <br />
              {model.description}
            </div>
          </Html>
        </group>
      ))}
    </>
  );
}

export default function ShadingModels(): React.JSX.Element {
  const [azimuth, setAzimuth] = useState(INITIAL.azimuth);
  const [elevation, setElevation] = useState(INITIAL.elevation);
  const [detail, setDetail] = useState(INITIAL.detail);
  const [metallic, setMetallic] = useState(INITIAL.metallic);

  const az = (azimuth * Math.PI) / 180;
  const el = (elevation * Math.PI) / 180;
  const lightPos: [number, number, number] = [
    6 * Math.cos(el) * Math.sin(az),
    6 * Math.sin(el),
    6 * Math.cos(el) * Math.cos(az),
  ];

  const caption =
    detail <= 10
      ? "With so few triangles, Flat shading shows hard facets while Phong/PBR still look smooth — per-pixel lighting hides the low-poly geometry."
      : "Same orange sphere four times — only the shading model differs. Move the light and watch how each one handles the highlight.";

  return (
    <PlaygroundFrame
      title="Four shading models, one light"
      caption={caption}
      onReset={() => {
        setAzimuth(INITIAL.azimuth);
        setElevation(INITIAL.elevation);
        setDetail(INITIAL.detail);
        setMetallic(INITIAL.metallic);
      }}
      controls={
        <>
          <SliderControl
            label="Light azimuth"
            value={azimuth}
            min={-180}
            max={180}
            onInput={setAzimuth}
            format={(v) => `${v}°`}
          />
          <SliderControl
            label="Light elevation"
            value={elevation}
            min={5}
            max={85}
            onInput={setElevation}
            format={(v) => `${v}°`}
          />
          <SliderControl
            label="Sphere detail (segments)"
            value={detail}
            min={6}
            max={48}
            onInput={setDetail}
          />
          <SwitchControl label="Metallic PBR sphere" checked={metallic} onChange={setMetallic} />
        </>
      }
    >
      <Canvas camera={{ position: [0, 1.0, 9], fov: 50 }} dpr={[1, 2]}>
        <color attach="background" args={["#1b1f24"]} />
        <ambientLight intensity={0.25} />
        <directionalLight position={lightPos} intensity={2.2} />
        <mesh position={lightPos}>
          <sphereGeometry args={[0.08, 12, 8]} />
          <meshBasicMaterial color="#fff3c4" />
        </mesh>
        <Spheres detail={detail} metallic={metallic} />
        <OrbitControls enablePan={false} minDistance={3} maxDistance={12} />
      </Canvas>
    </PlaygroundFrame>
  );
}
