import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";
import { usePostPass } from "./lib/usePostPass";

/**
 * Bloom via three's bundled UnrealBloomPass. The scene mixes genuinely HDR
 * emitters (emissiveIntensity 2–4, so linear values above 1) with ordinary
 * matte surfaces lit below 1 — the threshold slider decides which of the two
 * groups gets to glow, and dropping it below 1 reproduces the classic
 * "everything blooms" mistake.
 */

const INITIAL = { bloom: true, threshold: 1, strength: 1.2, radius: 0.4 };

const buildPasses = (): readonly [UnrealBloomPass, OutputPass] =>
  [
    new UnrealBloomPass(
      new THREE.Vector2(256, 256), // corrected by composer.addPass/setSize
      INITIAL.strength,
      INITIAL.radius,
      INITIAL.threshold,
    ),
    new OutputPass(),
  ] as const;

function Effects({
  bloom,
  threshold,
  strength,
  radius,
}: {
  bloom: boolean;
  threshold: number;
  strength: number;
  radius: number;
}): null {
  usePostPass(buildPasses, ([bloomPass]) => {
    bloomPass.enabled = bloom;
    bloomPass.threshold = threshold;
    bloomPass.strength = strength;
    bloomPass.radius = radius;
  });
  return null;
}

function NeonScene(): React.JSX.Element {
  return (
    <>
      {/* HDR emitters: linear values of 2–4, well above the display's 1.0. */}
      <mesh position={[0, 0.5, 0]} rotation={[0.6, 0.3, 0]}>
        <torusKnotGeometry args={[0.7, 0.16, 180, 24]} />
        <meshStandardMaterial color="#000000" emissive="#ff2d95" emissiveIntensity={3.2} />
      </mesh>
      <mesh position={[-2.6, 0.6, -1]} rotation={[Math.PI / 2.4, 0.4, 0]}>
        <torusGeometry args={[0.75, 0.07, 16, 96]} />
        <meshStandardMaterial color="#000000" emissive="#27e3ff" emissiveIntensity={2.6} />
      </mesh>
      {[-0.7, 0, 0.7].map((x) => (
        <mesh key={x} position={[2.7 + x * 0.55, 0.55, -1.6 + x]}>
          <cylinderGeometry args={[0.05, 0.05, 1.9, 16]} />
          <meshStandardMaterial color="#000000" emissive="#ffb347" emissiveIntensity={2.4} />
        </mesh>
      ))}

      {/* Non-emissive control group: lit to well under 1.0 in linear terms.
          These should NOT glow — unless the threshold drops below 1. */}
      <mesh position={[-1.3, -0.35, 1.2]}>
        <sphereGeometry args={[0.42, 48, 32]} />
        <meshStandardMaterial color="#9aa1a9" roughness={0.6} />
      </mesh>
      <mesh position={[1.2, -0.3, 1.4]} rotation={[0, 0.5, 0]}>
        <boxGeometry args={[0.7, 0.7, 0.7]} />
        <meshStandardMaterial color="#8f969e" roughness={0.7} />
      </mesh>
      <mesh position={[0, -0.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[26, 26]} />
        <meshStandardMaterial color="#343a42" roughness={0.85} />
      </mesh>

      <directionalLight position={[4, 6, 5]} intensity={1.8} />
      <ambientLight intensity={0.15} />
    </>
  );
}

function buildCaption(bloom: boolean, threshold: number): string {
  if (!bloom) {
    return "Bloom off: the neon shapes still emit HDR values above 1.0, but nothing spills — bright just means a white pixel, not a glow. Flip bloom back on to compare.";
  }
  if (threshold < 0.95) {
    return `Threshold ${threshold.toFixed(2)} — below 1.0, so ordinary lit surfaces cross the cutoff: the matte gray sphere, cube, and even the floor now glow. That's the classic over-bloom mistake; glow should be reserved for pixels brighter than the display can show (>1).`;
  }
  return `Threshold ${threshold.toFixed(2)}: only HDR pixels above the cutoff bloom, so the neon emitters (intensity 2.4–3.2) spill light while the gray sub-1.0 surfaces stay crisp. Strength scales the glow, radius spreads it wider.`;
}

export default function Bloom(): React.JSX.Element {
  const [bloom, setBloom] = useState(INITIAL.bloom);
  const [threshold, setThreshold] = useState(INITIAL.threshold);
  const [strength, setStrength] = useState(INITIAL.strength);
  const [radius, setRadius] = useState(INITIAL.radius);

  return (
    <PlaygroundFrame
      title="Bloom: glow for pixels brighter than the screen"
      caption={buildCaption(bloom, threshold)}
      onReset={() => {
        setBloom(INITIAL.bloom);
        setThreshold(INITIAL.threshold);
        setStrength(INITIAL.strength);
        setRadius(INITIAL.radius);
      }}
      controls={
        <>
          <SwitchControl label="Bloom" checked={bloom} onChange={setBloom} />
          <SliderControl
            label="Threshold"
            value={threshold}
            min={0}
            max={2}
            step={0.05}
            onInput={setThreshold}
            format={(v) => v.toFixed(2)}
          />
          <SliderControl
            label="Strength"
            value={strength}
            min={0}
            max={3}
            step={0.1}
            onInput={setStrength}
            format={(v) => v.toFixed(1)}
          />
          <SliderControl
            label="Radius"
            value={radius}
            min={0}
            max={1}
            step={0.05}
            onInput={setRadius}
            format={(v) => v.toFixed(2)}
          />
        </>
      }
    >
      <Canvas camera={{ position: [0, 1, 7.5], fov: 50 }} dpr={[1, 2]}>
        <color attach="background" args={["#07080c"]} />
        <NeonScene />
        <Effects bloom={bloom} threshold={threshold} strength={strength} radius={radius} />
        <OrbitControls enablePan={false} minDistance={3} maxDistance={14} />
      </Canvas>
    </PlaygroundFrame>
  );
}
