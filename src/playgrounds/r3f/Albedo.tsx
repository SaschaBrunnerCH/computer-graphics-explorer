import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SegmentedControl } from "../../components/controls";

/**
 * Albedo isolated: the same base color on two spheres — the left one unlit
 * (MeshBasicMaterial shows the raw stored color, nothing else), the right one
 * fully shaded under a movable lamp. Snow vs charcoal under the same light is
 * the whole lesson: albedo is reflectivity, not brightness.
 */

type Preset = "brick" | "grass" | "snow" | "charcoal";

const INITIAL = { preset: "brick" as Preset, intensity: 2, angle: 40 };

const PRESETS: Record<Preset, { hex: string; line: string }> = {
  brick: {
    hex: "#9c4a37",
    line: "Brick reflects roughly a third of incoming light, mostly in the red.",
  },
  grass: {
    hex: "#4f7a36",
    line: "Grass has a modest green-leaning albedo — it absorbs most of the lamp.",
  },
  snow: {
    hex: "#f2f6fa",
    line: "Snow reflects almost everything — even with the lamp turned low it stays bright.",
  },
  charcoal: {
    hex: "#2e2e31",
    line: "Charcoal absorbs nearly everything — crank the lamp and it barely brightens.",
  },
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 12,
  width: 130,
  textAlign: "center",
  color: "var(--calcite-color-text-2)",
  pointerEvents: "none",
};

export default function Albedo(): React.JSX.Element {
  const [preset, setPreset] = useState<Preset>(INITIAL.preset);
  const [intensity, setIntensity] = useState(INITIAL.intensity);
  const [angle, setAngle] = useState(INITIAL.angle);

  const color = PRESETS[preset].hex;
  const az = (angle * Math.PI) / 180;
  const lightPos: [number, number, number] = [6 * Math.sin(az), 4, 6 * Math.cos(az)];

  const caption = `${PRESETS[preset].line} The unlit sphere is pure albedo — what's left when you strip all lighting away. Real-world albedo is why a white shirt feels cooler in the sun than a black one.`;

  return (
    <PlaygroundFrame
      title="Albedo: the color before any light"
      caption={caption}
      onReset={() => {
        setPreset(INITIAL.preset);
        setIntensity(INITIAL.intensity);
        setAngle(INITIAL.angle);
      }}
      controls={
        <>
          <SegmentedControl<Preset>
            label="Albedo"
            value={preset}
            options={[
              { value: "brick", label: "Brick" },
              { value: "grass", label: "Grass" },
              { value: "snow", label: "Snow" },
              { value: "charcoal", label: "Charcoal" },
            ]}
            onChange={setPreset}
          />
          <SliderControl
            label="Light intensity"
            value={intensity}
            min={0}
            max={6}
            step={0.1}
            onInput={setIntensity}
            format={(v) => v.toFixed(1)}
          />
          <SliderControl
            label="Light angle"
            value={angle}
            min={-180}
            max={180}
            onInput={setAngle}
            format={(v) => `${v}°`}
          />
        </>
      }
    >
      <Canvas camera={{ position: [0, 0.7, 6], fov: 50 }} dpr={[1, 2]}>
        <color attach="background" args={["#1b1f24"]} />
        <ambientLight intensity={0.12} />
        <directionalLight position={lightPos} intensity={intensity} />
        <mesh position={lightPos}>
          <sphereGeometry args={[0.08, 12, 8]} />
          <meshBasicMaterial color="#fff3c4" />
        </mesh>

        {/* Left: pure albedo — no lighting math, tone mapping off, the raw stored color. */}
        <group position={[-1.6, 0, 0]}>
          <mesh>
            <sphereGeometry args={[1.1, 48, 32]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
          <Html center position={[0, -1.75, 0]} style={{ pointerEvents: "none" }}>
            <div style={LABEL_STYLE}>
              <strong>Unlit</strong>
              <br />
              pure albedo
            </div>
          </Html>
        </group>

        {/* Right: the same albedo fed through real shading. */}
        <group position={[1.6, 0, 0]}>
          <mesh>
            <sphereGeometry args={[1.1, 48, 32]} />
            <meshStandardMaterial color={color} roughness={0.55} metalness={0} />
          </mesh>
          <Html center position={[0, -1.75, 0]} style={{ pointerEvents: "none" }}>
            <div style={LABEL_STYLE}>
              <strong>Shaded</strong>
              <br />
              albedo × lighting
            </div>
          </Html>
        </group>

        <OrbitControls enablePan={false} minDistance={3} maxDistance={11} />
      </Canvas>
    </PlaygroundFrame>
  );
}
