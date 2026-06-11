import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl } from "../../components/controls";
import { createHeightMapTexture, createNormalMapTexture } from "./lib/heightmap";

type DetailMode = "none" | "bump" | "normal";

const INITIAL = { mode: "normal" as DetailMode, intensity: 100, azimuth: 55 };

const MODE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "bump", label: "Bump map" },
  { value: "normal", label: "Normal map" },
] as const;

function DetailSphere({
  mode,
  intensity,
}: {
  mode: DetailMode;
  intensity: number;
}): React.JSX.Element {
  // Both maps come from the same procedural brick height field — created once
  // per mount, disposed with the texture instance (StrictMode-safe).
  const bumpTexture = useMemo(() => {
    const texture = createHeightMapTexture();
    texture.repeat.set(2, 1);
    return texture;
  }, []);
  const normalTexture = useMemo(() => {
    const texture = createNormalMapTexture();
    texture.repeat.set(2, 1);
    return texture;
  }, []);
  useEffect(() => () => bumpTexture.dispose(), [bumpTexture]);
  useEffect(() => () => normalTexture.dispose(), [normalTexture]);

  return (
    <mesh>
      <sphereGeometry args={[1.15, 96, 64]} />
      {/* key={mode} remounts the material so adding/removing map slots
          recompiles the shader cleanly; r3f disposes the old instance. */}
      <meshStandardMaterial
        key={mode}
        color="#b0623f"
        roughness={0.8}
        metalness={0.05}
        bumpMap={mode === "bump" ? bumpTexture : null}
        bumpScale={(intensity / 100) * 3}
        normalMap={mode === "normal" ? normalTexture : null}
        normalScale={[intensity / 100, intensity / 100]}
      />
    </mesh>
  );
}

function buildCaption(mode: DetailMode, intensity: number): string {
  if (mode !== "none" && intensity === 0) {
    return "Intensity 0% switches the perturbation off — identical to None. Raise it and the bricks fade back in without a single new triangle.";
  }
  switch (mode) {
    case "none":
      return "Plain smooth sphere — the brick relief you'll see next is painted on purely with lighting, never with geometry.";
    case "bump":
      return "Bump map: a single grayscale height channel nudges the shading. Swing the light — grooves brighten and darken correctly, yet the silhouette stays a perfect circle.";
    case "normal":
      return "Normal map: full per-pixel surface directions baked into RGB. The lighting on every mortar groove moves correctly with the light, but the silhouette stays perfectly smooth — it's a lighting trick, not geometry.";
  }
}

export default function NormalMapping(): React.JSX.Element {
  const [mode, setMode] = useState<DetailMode>(INITIAL.mode);
  const [intensity, setIntensity] = useState(INITIAL.intensity);
  const [azimuth, setAzimuth] = useState(INITIAL.azimuth);

  const az = (azimuth * Math.PI) / 180;
  const el = (28 * Math.PI) / 180;
  const lightPos: [number, number, number] = [
    4.5 * Math.cos(el) * Math.sin(az),
    4.5 * Math.sin(el),
    4.5 * Math.cos(el) * Math.cos(az),
  ];

  return (
    <PlaygroundFrame
      title="Fake relief: bump & normal mapping"
      caption={buildCaption(mode, intensity)}
      onReset={() => {
        setMode(INITIAL.mode);
        setIntensity(INITIAL.intensity);
        setAzimuth(INITIAL.azimuth);
      }}
      controls={
        <>
          <SegmentedControl
            label="Surface detail"
            options={MODE_OPTIONS}
            value={mode}
            onChange={setMode}
          />
          <SliderControl
            label="Intensity"
            value={intensity}
            min={0}
            max={200}
            step={5}
            onInput={setIntensity}
            format={(v) => `${v}%`}
          />
          <SliderControl
            label="Light azimuth"
            value={azimuth}
            min={-180}
            max={180}
            onInput={setAzimuth}
            format={(v) => `${v}°`}
          />
        </>
      }
    >
      <Canvas camera={{ position: [0, 0.5, 3.6], fov: 45 }} dpr={[1, 2]}>
        <color attach="background" args={["#171b21"]} />
        <ambientLight intensity={0.18} />
        <directionalLight position={lightPos} intensity={2.2} />
        <mesh position={lightPos}>
          <sphereGeometry args={[0.07, 12, 8]} />
          <meshBasicMaterial color="#fff3c4" />
        </mesh>
        <DetailSphere mode={mode} intensity={intensity} />
        <OrbitControls enablePan={false} minDistance={2} maxDistance={8} />
      </Canvas>
    </PlaygroundFrame>
  );
}
