import { useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { MeshReflectorMaterial, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";

/**
 * Screen-space reflections — taught through their defining failure mode.
 *
 * Honesty note (per DECISIONS.md): drei's MeshReflectorMaterial is a PLANAR
 * reflector — it re-renders the whole scene from a mirrored camera, so unlike
 * true SSR it still "sees" objects that have left the screen. To demonstrate
 * SSR's real limitation we apply SSR's rule ourselves: every frame we test the
 * orange sphere against the main camera's view frustum, and while the
 * "Reflections see only the screen" switch is on, a fully off-screen sphere is
 * hidden from the reflection pass. Hiding it is safe because an off-screen
 * object contributes nothing to the main render anyway — so what you see is
 * exactly what real SSR produces: the reflection dies the moment its source
 * leaves the frame. Flip the switch off to compare with a true planar
 * reflection, which keeps reflecting things the screen can no longer see.
 */

const INITIAL = { slide: 2, blur: 30, reflections: true, ssrLimit: true };

/** Radius of the sliding sphere; also used for the frustum test. */
const SPHERE_RADIUS = 0.7;

function SlidingSphere({
  slide,
  ssrLimit,
  onOffscreenChange,
}: {
  slide: number;
  ssrLimit: boolean;
  onOffscreenChange: (offscreen: boolean) => void;
}): React.JSX.Element {
  const meshRef = useRef<THREE.Mesh>(null);
  const wasOffscreen = useRef(false);
  // Scratch objects reused every frame (no GPU resources, nothing to dispose).
  const scratch = useRef({
    frustum: new THREE.Frustum(),
    matrix: new THREE.Matrix4(),
    sphere: new THREE.Sphere(),
  });

  // Runs before drei's reflector pass (priority -1 < its default 0): this is
  // the "screen knowledge" test that defines SSR. If the sphere's bounding
  // sphere is fully outside the main camera's frustum, the screen knows
  // nothing about it — so in SSR mode we drop it from rendering, which only
  // affects the reflection (the main render couldn't see it anyway).
  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const { frustum, matrix, sphere } = scratch.current;
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(matrix);
    mesh.getWorldPosition(sphere.center);
    sphere.radius = SPHERE_RADIUS;
    const offscreen = !frustum.intersectsSphere(sphere);
    mesh.visible = !(ssrLimit && offscreen);
    if (offscreen !== wasOffscreen.current) {
      wasOffscreen.current = offscreen;
      onOffscreenChange(offscreen);
    }
  }, -1);

  return (
    <mesh ref={meshRef} position={[slide, SPHERE_RADIUS, 0.4]}>
      <sphereGeometry args={[SPHERE_RADIUS, 48, 32]} />
      <meshStandardMaterial color="#e06b2d" roughness={0.25} metalness={0.1} />
    </mesh>
  );
}

export default function Ssr(): React.JSX.Element {
  const [slide, setSlide] = useState(INITIAL.slide);
  const [blur, setBlur] = useState(INITIAL.blur);
  const [reflections, setReflections] = useState(INITIAL.reflections);
  const [ssrLimit, setSsrLimit] = useState(INITIAL.ssrLimit);
  const [offscreen, setOffscreen] = useState(false);

  const caption = !reflections
    ? "Reflections off: just a dark floor. Turn them back on and slide the orange sphere toward the edge of the frame."
    : offscreen && ssrLimit
      ? "The orange sphere has left the screen — and its reflection died with it. That is the defining limit of screen-space reflections: they can only reflect what the screen already shows. (Look for this in games as reflections smearing or fading at the screen edges.)"
      : offscreen && !ssrLimit
        ? "The sphere is off-screen, yet its reflection survives — this planar reflector re-renders the whole scene, so it knows more than the screen does. True SSR would have lost it; flip 'Reflections see only the screen' to see that."
        : "A wet polished floor reflecting three objects. Note: this is a planar reflection standing in for SSR — same look, and with the switch on, the same defining limitation. Slide the orange sphere out of the frame and watch its reflection.";

  return (
    <PlaygroundFrame
      title="Screen-space reflections: only what the screen knows"
      caption={caption}
      onReset={() => {
        setSlide(INITIAL.slide);
        setBlur(INITIAL.blur);
        setReflections(INITIAL.reflections);
        setSsrLimit(INITIAL.ssrLimit);
      }}
      controls={
        <>
          <SliderControl
            label="Slide object"
            value={slide}
            min={0}
            max={10}
            step={0.1}
            onInput={setSlide}
            format={(v) => v.toFixed(1)}
          />
          <SliderControl
            label="Floor roughness / blur"
            value={blur}
            min={0}
            max={100}
            step={5}
            onInput={setBlur}
            format={(v) => `${v}%`}
          />
          <SwitchControl label="Reflections" checked={reflections} onChange={setReflections} />
          <SwitchControl
            label="Reflections see only the screen (SSR)"
            checked={ssrLimit}
            onChange={setSsrLimit}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Drag to orbit. The reflection here comes from a planar reflector (it mirrors the scene
            through the floor plane); the SSR switch imposes the screen-space rule on top of it.
          </p>
        </>
      }
    >
      <Canvas camera={{ position: [0, 2.6, 7.5], fov: 45 }} dpr={[1, 2]}>
        <color attach="background" args={["#101318"]} />
        <fog attach="fog" args={["#101318", 14, 30]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[4, 7, 4]} intensity={1.8} />
        <directionalLight position={[-6, 4, -3]} intensity={0.6} color="#9db4ff" />

        {/* Wet polished floor. R3F disposes JSX-created geometries/materials on unmount. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[40, 40]} />
          {reflections ? (
            <MeshReflectorMaterial
              resolution={512}
              blur={[300, 100]}
              mixBlur={(blur / 100) * 4}
              mixStrength={12}
              mirror={0.55}
              depthScale={1}
              minDepthThreshold={0.4}
              maxDepthThreshold={1.4}
              roughness={0.55 + (blur / 100) * 0.4}
              metalness={0.55}
              color="#15191f"
            />
          ) : (
            <meshStandardMaterial color="#15191f" roughness={0.95} metalness={0.2} />
          )}
        </mesh>

        {/* Two stationary objects for reference… */}
        <mesh position={[-2.4, 0.7, -0.4]}>
          <boxGeometry args={[1.4, 1.4, 1.4]} />
          <meshStandardMaterial color="#4f86f7" roughness={0.35} />
        </mesh>
        <mesh position={[-0.2, 1.0, -1.0]}>
          <torusKnotGeometry args={[0.55, 0.2, 128, 24]} />
          <meshStandardMaterial color="#37b26c" roughness={0.3} metalness={0.4} />
        </mesh>
        {/* …and the one the slider pushes out of the frame. */}
        <SlidingSphere slide={slide} ssrLimit={ssrLimit} onOffscreenChange={setOffscreen} />

        <OrbitControls
          enablePan={false}
          target={[0, 0.9, 0]}
          minDistance={4}
          maxDistance={12}
          maxPolarAngle={Math.PI / 2.1}
        />
      </Canvas>
    </PlaygroundFrame>
  );
}
