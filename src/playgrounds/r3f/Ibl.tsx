import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, type RootState } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl } from "../../components/controls";

/**
 * Image-based lighting with the environment as the star: a chrome sphere and
 * a rough dielectric knot lit only by the bundled RoomEnvironment (PMREM'd
 * locally — no network). Swap to a single directional light and watch the
 * chrome starve: a mirror can only show what surrounds it.
 */

type Source = "environment" | "directional" | "both";

const INITIAL = { source: "environment" as Source, intensity: 1, blur: 0.05 };

const SOURCE_OPTIONS = [
  { value: "environment", label: "Env" },
  { value: "directional", label: "Sun" },
  { value: "both", label: "Both" },
] as const;

/** Applies the scene-level IBL knobs each frame (state param, no scene refs). */
function SceneTuner({ intensity, blur }: { intensity: number; blur: number }): null {
  useFrame(({ scene }) => {
    scene.environmentIntensity = intensity;
    scene.backgroundBlurriness = blur;
  });
  return null;
}

function buildCaption(source: Source, intensity: number): string {
  switch (source) {
    case "environment":
      return intensity < 0.3
        ? "Environment intensity is nearly zero, so almost no light arrives from any direction — turn it back up and the whole room becomes the light again."
        : "No light objects exist in this scene at all: every pixel of the surrounding room acts as a tiny light. The chrome sphere is lit purely by what it reflects; the rough knot gathers the same light smeared into a soft average. That is image-based lighting.";
    case "directional":
      return "The environment no longer lights anything — one directional light remains. The chrome sphere goes nearly black: a perfect mirror can only show its surroundings, and a single light direction is almost nothing to reflect. The rough surface survives; the mirror starves.";
    case "both":
      return "Environment plus a directional “sun”: the IBL fills every direction with soft, believable light while the directional light adds a strong highlight and a clear shading direction — the standard recipe in production renderers.";
  }
}

export default function Ibl(): React.JSX.Element {
  const [source, setSource] = useState<Source>(INITIAL.source);
  const [intensity, setIntensity] = useState(INITIAL.intensity);
  const [blur, setBlur] = useState(INITIAL.blur);

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

  const useEnv = source !== "directional";
  const useSun = source !== "environment";

  return (
    <PlaygroundFrame
      title="Image-based lighting: the room is the light"
      caption={buildCaption(source, intensity)}
      onReset={() => {
        setSource(INITIAL.source);
        setIntensity(INITIAL.intensity);
        setBlur(INITIAL.blur);
      }}
      controls={
        <>
          <SegmentedControl<Source>
            label="Light source"
            options={SOURCE_OPTIONS}
            value={source}
            onChange={setSource}
          />
          {useEnv && (
            <SliderControl
              label="Environment intensity"
              value={intensity}
              min={0}
              max={3}
              step={0.1}
              onInput={setIntensity}
              format={(v) => `${v.toFixed(1)}×`}
            />
          )}
          <SliderControl
            label="Background blur"
            value={blur}
            min={0}
            max={1}
            step={0.05}
            onInput={setBlur}
            format={(v) => v.toFixed(2)}
          />
        </>
      }
    >
      <Canvas camera={{ position: [0, 0.6, 6], fov: 45 }} dpr={[1, 2]} onCreated={bakeEnvironment}>
        <color attach="background" args={["#181c21"]} />
        {envMap && <primitive object={envMap} attach="background" />}
        {useEnv && envMap && <primitive object={envMap} attach="environment" />}
        <SceneTuner intensity={intensity} blur={blur} />

        {useSun && <directionalLight position={[4, 6, 3]} intensity={3} />}

        {/* Chrome: perfect mirror — pure environment reflection. */}
        <mesh position={[-1.35, 0, 0]}>
          <sphereGeometry args={[1, 64, 48]} />
          <meshStandardMaterial color="#ffffff" metalness={1} roughness={0} />
        </mesh>
        {/* Rough dielectric: gathers the same light into a soft average. */}
        <mesh position={[1.45, 0, 0]} rotation={[0.4, 0, 0]}>
          <torusKnotGeometry args={[0.62, 0.26, 160, 32]} />
          <meshStandardMaterial color="#b03a2e" metalness={0} roughness={0.85} />
        </mesh>

        <OrbitControls enablePan={false} minDistance={2.5} maxDistance={12} />
      </Canvas>
    </PlaygroundFrame>
  );
}
