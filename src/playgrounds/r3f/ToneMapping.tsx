import { useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl, SwitchControl } from "../../components/controls";
import { usePostPass } from "./lib/usePostPass";

/**
 * Tone mapping: the scene is rendered into a half-float HDR buffer (values
 * far above 1), then an OutputPass applies the chosen operator + exposure,
 * and finally a clip-detector pass paints any channel still at the 1.0
 * ceiling magenta — AFTER tone mapping, so you see exactly what each
 * operator fails (or refuses) to bring back into range.
 */

type Operator = "none" | "reinhard" | "aces";

// "None" maps to LinearToneMapping (exposure × color, hard clip at 1.0)
// rather than THREE.NoToneMapping: without any operator three skips the
// exposure multiply entirely, which would silently dead-end the exposure
// slider. Linear IS "no operator" in the photographic sense — no rolloff.
const OPERATORS: Record<Operator, { label: string; mapping: THREE.ToneMapping }> = {
  none: { label: "None", mapping: THREE.LinearToneMapping },
  reinhard: { label: "Reinhard", mapping: THREE.ReinhardToneMapping },
  aces: { label: "ACES", mapping: THREE.ACESFilmicToneMapping },
};

const OPERATOR_OPTIONS = [
  { value: "none", label: "None" },
  { value: "reinhard", label: "Reinhard" },
  { value: "aces", label: "ACES" },
] as const;

const INITIAL = { operator: "none" as Operator, exposure: 1, showClipped: false };

/** Final pass: any channel at the display ceiling (>0.999) becomes magenta. */
const CLIP_SHADER = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      if (any(greaterThan(color.rgb, vec3(0.999)))) color.rgb = vec3(1.0, 0.0, 1.0);
      gl_FragColor = color;
    }`,
};

const buildPasses = (): readonly [OutputPass, ShaderPass] =>
  [new OutputPass(), new ShaderPass(CLIP_SHADER)] as const;

function Effects({
  operator,
  exposure,
  showClipped,
}: {
  operator: Operator;
  exposure: number;
  showClipped: boolean;
}): null {
  usePostPass(buildPasses, ([, clipPass]) => {
    clipPass.enabled = showClipped;
  });
  useFrame(({ gl }) => {
    // OutputPass re-reads these from the renderer every frame.
    gl.toneMapping = OPERATORS[operator].mapping;
    gl.toneMappingExposure = exposure;
  });
  return null;
}

function HdrScene(): React.JSX.Element {
  return (
    <>
      {/* The "sun": emissive far above 1 — genuinely HDR before tone mapping. */}
      <mesh position={[-2.6, 2.4, -2]}>
        <sphereGeometry args={[0.7, 48, 32]} />
        <meshStandardMaterial color="#000000" emissive="#fff1c4" emissiveIntensity={14} />
      </mesh>
      <pointLight position={[-2.6, 2.4, -2]} color="#ffd9a0" intensity={70} />

      {/* Warmly lit hero objects near the sun. */}
      <mesh position={[-1.1, 0.05, 0]} rotation={[0.5, 0.4, 0]}>
        <torusKnotGeometry args={[0.55, 0.22, 140, 24]} />
        <meshStandardMaterial color="#c8cdd2" metalness={0.2} roughness={0.3} />
      </mesh>
      <mesh position={[0.7, -0.25, 0.8]}>
        <sphereGeometry args={[0.45, 48, 32]} />
        <meshStandardMaterial color="#b03a2e" roughness={0.5} />
      </mesh>

      {/* The dim corner: barely lit — watch it die when exposure favors the sun. */}
      <mesh position={[2.9, -0.3, -1.6]}>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial color="#5a6b8c" roughness={0.8} />
      </mesh>
      <pointLight position={[3.4, 0.8, -0.4]} color="#7a93c4" intensity={1.2} />

      <mesh position={[0, -0.75, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[24, 24]} />
        <meshStandardMaterial color="#3c4148" roughness={0.9} />
      </mesh>
      <ambientLight intensity={0.04} />
    </>
  );
}

function buildCaption(operator: Operator, exposure: number, showClipped: boolean): string {
  const clipNote = showClipped ? " Magenta marks channels stuck at the 1.0 display ceiling." : "";
  switch (operator) {
    case "none":
      return exposure > 1.5
        ? `No operator, exposure ${exposure.toFixed(1)}×: every value is scaled linearly and chopped at 1.0 — the sun, the highlights, even the floor clip to flat white with zero detail.${clipNote}`
        : `No operator: linear exposure, then a hard clip at 1.0. The emissive sun sits far above 1, so it clips to a flat disc even now — raise the exposure and watch the clipping spread.${clipNote}`;
    case "reinhard":
      return `Reinhard maps x to x/(1+x): output never reaches 1.0, so nothing clips${showClipped ? " — no magenta even at maximum exposure" : ""}. The price is rolloff everywhere: brights compress early and the image drifts gray.`;
    case "aces":
      return `ACES keeps mid-tones nearly linear and rolls highlights off along a film-like shoulder: the sun saturates gracefully instead of clipping, while the dim corner keeps its contrast.${clipNote}`;
  }
}

export default function ToneMapping(): React.JSX.Element {
  const [operator, setOperator] = useState<Operator>(INITIAL.operator);
  const [exposure, setExposure] = useState(INITIAL.exposure);
  const [showClipped, setShowClipped] = useState(INITIAL.showClipped);

  return (
    <PlaygroundFrame
      title="Tone mapping: fitting HDR onto your display"
      caption={buildCaption(operator, exposure, showClipped)}
      onReset={() => {
        setOperator(INITIAL.operator);
        setExposure(INITIAL.exposure);
        setShowClipped(INITIAL.showClipped);
      }}
      controls={
        <>
          <SegmentedControl<Operator>
            label="Operator"
            options={OPERATOR_OPTIONS}
            value={operator}
            onChange={setOperator}
          />
          <SliderControl
            label="Exposure"
            value={exposure}
            min={0.1}
            max={4}
            step={0.1}
            onInput={setExposure}
            format={(v) => `${v.toFixed(1)}×`}
          />
          <SwitchControl
            label="Show clipped pixels"
            checked={showClipped}
            onChange={setShowClipped}
          />
        </>
      }
    >
      <Canvas camera={{ position: [0, 1.2, 7], fov: 50 }} dpr={[1, 2]}>
        <color attach="background" args={["#0c0e11"]} />
        <HdrScene />
        <Effects operator={operator} exposure={exposure} showClipped={showClipped} />
        <OrbitControls enablePan={false} minDistance={3} maxDistance={14} />
      </Canvas>
    </PlaygroundFrame>
  );
}
