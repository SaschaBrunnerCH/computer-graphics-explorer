import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SwitchControl } from "../../components/controls";

/**
 * Backface culling: an open cylinder and a cutaway sphere. With culling on,
 * triangles facing away are skipped, so the cylinder's inner wall vanishes.
 * "None" is rendered honestly as a second back-face pass (FrontSide +
 * BackSide), so the submitted-triangle counter from gl.info really doubles —
 * material.side = DoubleSide alone would not change what gl.info counts.
 */

type CullMode = "back" | "none";

const INITIAL = { culling: "back" as CullMode, flip: false };

const CULL_OPTIONS = [
  { value: "back", label: "Back faces" },
  { value: "none", label: "None" },
] as const;

/** Samples gl.info.render.triangles ~2×/s; three resets info at the start of
 *  render(), so inside useFrame we read the previous frame's full count. */
function TriangleProbe({ onSample }: { onSample: (count: number) => void }): null {
  const lastSampleRef = useRef(0);
  useFrame(({ gl, clock }) => {
    const t = clock.getElapsedTime();
    if (t - lastSampleRef.current < 0.5) return;
    lastSampleRef.current = t;
    onSample(gl.info.render.triangles);
  });
  return null;
}

export default function BackfaceCulling(): React.JSX.Element {
  const [culling, setCulling] = useState<CullMode>(INITIAL.culling);
  const [flip, setFlip] = useState(INITIAL.flip);
  const [triangles, setTriangles] = useState(0);

  const cylinderGeometry = useMemo(() => new THREE.CylinderGeometry(0.9, 0.9, 2, 36, 1, true), []);
  const sphereGeometry = useMemo(
    () => new THREE.SphereGeometry(1.05, 36, 20, 0, Math.PI * 1.5),
    [],
  );
  useEffect(() => () => cylinderGeometry.dispose(), [cylinderGeometry]);
  useEffect(() => () => sphereGeometry.dispose(), [sphereGeometry]);

  // One render pass per entry: culling keeps a single side; "none" submits
  // both orientations, so every surface appears and the triangle count doubles.
  const sides: THREE.Side[] =
    culling === "none"
      ? [THREE.FrontSide, THREE.BackSide]
      : [flip ? THREE.BackSide : THREE.FrontSide];

  const modeText =
    culling === "none"
      ? "No culling: every surface is drawn from both sides (a second back-face pass here), so the counter roughly doubles and the cylinder's inner wall and the sphere's hollow interior appear."
      : flip
        ? "Normals flipped (THREE.BackSide keeps the opposite winding): now only the insides survive culling and the outer surfaces vanish instead."
        : "Back-face culling on: the GPU discards triangles whose winding faces away after they are submitted. Look into the cylinder — its far inner wall simply is not drawn.";
  const caption = `Triangles submitted to the GPU last frame: ${triangles.toLocaleString()}. ${modeText}`;

  return (
    <PlaygroundFrame
      title="Backface culling: half the triangles for free"
      caption={caption}
      onReset={() => {
        setCulling(INITIAL.culling);
        setFlip(INITIAL.flip);
      }}
      controls={
        <>
          <SegmentedControl
            label="Culling"
            options={CULL_OPTIONS}
            value={culling}
            onChange={setCulling}
          />
          <SwitchControl label="Flip normals" checked={flip} onChange={setFlip} />
          {culling === "none" && (
            <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
              With culling off, both sides are drawn anyway — flipping normals changes nothing.
            </p>
          )}
        </>
      }
    >
      <Canvas camera={{ position: [0, 2.2, 6.2], fov: 50 }} dpr={[1, 2]}>
        <color attach="background" args={["#1b1f24"]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[4, 6, 5]} intensity={1.6} />
        <directionalLight position={[-4, 2, -4]} intensity={0.6} />

        {sides.map((side) => (
          <group key={side}>
            <mesh geometry={cylinderGeometry} position={[-1.35, 0, 0]} rotation={[0.7, 0, 0]}>
              <meshStandardMaterial color="#e06b2d" roughness={0.5} side={side} />
            </mesh>
            {/* phiLength 1.5π leaves a 90° gap centred at phi 315° → rotate it toward camera */}
            <mesh
              geometry={sphereGeometry}
              position={[1.35, 0, 0]}
              rotation={[0.25, Math.PI * 0.75, 0]}
            >
              <meshStandardMaterial color="#4f9edb" roughness={0.5} side={side} />
            </mesh>
          </group>
        ))}

        <TriangleProbe onSample={setTriangles} />
        <OrbitControls enablePan={false} minDistance={2.5} maxDistance={12} />
      </Canvas>
    </PlaygroundFrame>
  );
}
