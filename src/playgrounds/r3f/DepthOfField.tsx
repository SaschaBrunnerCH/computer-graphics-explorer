import { useEffect, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl } from "../../components/controls";
import { usePostPass, type PostPassContext } from "./lib/usePostPass";

/**
 * Depth of field via three's bundled BokehPass: three rows of chess-piece-ish
 * shapes at distinct depths, a focus-distance slider spanning exactly those
 * rows, and click-to-focus — clicking raycasts into the scene and sets the
 * focal plane to the hit distance, just like tap-to-focus on a phone camera.
 * The camera is fixed (no orbit) so clicking never fights a drag gesture.
 */

const CAMERA_POSITION = new THREE.Vector3(0, 3, 10);

const ROWS = [
  { label: "front orange row", z: 2, color: "#e06b2d", scale: 1, spacing: 2.0 },
  { label: "middle blue row", z: -5, color: "#3f8efc", scale: 1.35, spacing: 3.1 },
  { label: "back green row", z: -12, color: "#3ec96f", scale: 1.8, spacing: 4.4 },
].map((row) => ({
  ...row,
  /** Straight-line distance from the (fixed) camera — what BokehPass focuses on. */
  distance: CAMERA_POSITION.distanceTo(new THREE.Vector3(0, 0.6, row.z)),
}));

const FOCUS_MIN = 5;
const FOCUS_MAX = 25;
/** Slider value 0–10 → BokehPass aperture (its useful range here is ~0–5e-3). */
const APERTURE_SCALE = 5e-4;
const MAX_BLUR = 0.012;

const INITIAL = { focus: Math.round(ROWS[1].distance * 10) / 10, aperture: 5 };

const buildPasses = ({ scene, camera }: PostPassContext): readonly [BokehPass, OutputPass] =>
  [
    new BokehPass(scene, camera, {
      focus: INITIAL.focus,
      aperture: INITIAL.aperture * APERTURE_SCALE,
      maxblur: MAX_BLUR,
    }),
    new OutputPass(),
  ] as const;

function Effects({ focus, aperture }: { focus: number; aperture: number }): null {
  usePostPass(buildPasses, ([bokeh]) => {
    const uniforms = bokeh.materialBokeh.uniforms;
    uniforms.focus.value = focus;
    uniforms.aperture.value = aperture * APERTURE_SCALE;
    uniforms.maxblur.value = MAX_BLUR;
  });
  return null;
}

/** Aims the fixed camera at the middle of the depth range once. */
function CameraAim(): null {
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    camera.lookAt(0, 0.4, -5);
  }, [camera]);
  return null;
}

function Piece({ x, color }: { x: number; color: string }): React.JSX.Element {
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.42, 0.52, 0.24, 24]} />
        <meshStandardMaterial color={color} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.16, 0.32, 0.75, 24]} />
        <meshStandardMaterial color={color} roughness={0.45} />
      </mesh>
      <mesh position={[0, 1.18, 0]}>
        <sphereGeometry args={[0.29, 32, 24]} />
        <meshStandardMaterial color={color} roughness={0.45} />
      </mesh>
    </group>
  );
}

function buildCaption(focus: number, aperture: number): string {
  if (aperture < 0.5) {
    return "Aperture near zero is a pinhole camera: everything is sharp at once and the focus distance barely matters. Open the aperture to shrink the in-focus zone.";
  }
  const nearest = ROWS.reduce((a, b) =>
    Math.abs(a.distance - focus) < Math.abs(b.distance - focus) ? a : b,
  );
  const offset = Math.abs(nearest.distance - focus);
  if (offset < 2) {
    return `Focal plane at ${focus.toFixed(1)} units: the ${nearest.label} (${nearest.distance.toFixed(1)} units away) is sharp while the other rows blur with distance from that plane. Click any piece to refocus on it.`;
  }
  return `Focal plane at ${focus.toFixed(1)} units sits between the rows, so no row is truly sharp — focus is a plane in space, not an object. Click a piece (or slide to ${nearest.distance.toFixed(1)}) to land it on the ${nearest.label}.`;
}

export default function DepthOfField(): React.JSX.Element {
  const [focus, setFocus] = useState(INITIAL.focus);
  const [aperture, setAperture] = useState(INITIAL.aperture);

  const focusAtDistance = (distance: number): void => {
    const clamped = Math.min(FOCUS_MAX, Math.max(FOCUS_MIN, distance));
    setFocus(Math.round(clamped * 10) / 10);
  };

  return (
    <PlaygroundFrame
      title="Depth of field: a focal plane, not a focal object"
      caption={buildCaption(focus, aperture)}
      onReset={() => {
        setFocus(INITIAL.focus);
        setAperture(INITIAL.aperture);
      }}
      controls={
        <>
          <SliderControl
            label="Focus distance"
            value={focus}
            min={FOCUS_MIN}
            max={FOCUS_MAX}
            step={0.1}
            onInput={setFocus}
            format={(v) => v.toFixed(1)}
          />
          <SliderControl
            label="Aperture"
            value={aperture}
            min={0}
            max={10}
            step={0.5}
            onInput={setAperture}
            format={(v) => v.toFixed(1)}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Rows sit at {ROWS.map((r) => r.distance.toFixed(1)).join(" / ")} units. Click any piece
            to focus on it.
          </p>
        </>
      }
    >
      <Canvas camera={{ position: CAMERA_POSITION.toArray(), fov: 50 }} dpr={[1, 2]}>
        <color attach="background" args={["#14171c"]} />
        <CameraAim />
        <directionalLight position={[5, 8, 4]} intensity={2} />
        <ambientLight intensity={0.35} />

        {/* Click-to-focus: r3f raycasts for us; the hit distance IS the focus. */}
        <group
          onPointerDown={(e) => {
            e.stopPropagation();
            focusAtDistance(e.distance);
          }}
        >
          {ROWS.map((row) => (
            <group key={row.z} position={[0, 0, row.z]} scale={row.scale}>
              {[-1, 0, 1].map((i) => (
                <Piece key={i} x={i * row.spacing} color={row.color} />
              ))}
            </group>
          ))}
          <mesh position={[0, 0, -8]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[70, 70]} />
            <meshStandardMaterial color="#262b33" roughness={0.9} />
          </mesh>
        </group>

        <Effects focus={focus} aperture={aperture} />
      </Canvas>
    </PlaygroundFrame>
  );
}
