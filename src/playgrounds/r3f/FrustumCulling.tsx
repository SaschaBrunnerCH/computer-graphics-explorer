import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";

/**
 * Top-down debug view of frustum culling: a "game camera" sits in the middle
 * of a field of boxes, and every box is tested against its frustum with
 * THREE.Frustum.intersectsSphere — the exact test engines run before drawing.
 */

const INITIAL = { heading: 0, fov: 60, showCulled: true };

const GAME_CAM_POS = new THREE.Vector3(0, 0.6, 0);
const GAME_CAM_NEAR = 0.5;
const GAME_CAM_FAR = 8;
const GAME_CAM_ASPECT = 16 / 9;

interface SceneObject {
  position: THREE.Vector3;
  size: number;
  radius: number;
}

/** Deterministic LCG so the 40 boxes land in the same spots every mount. */
function buildObjects(): SceneObject[] {
  let seed = 20260611;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const objects: SceneObject[] = [];
  while (objects.length < 40) {
    const x = (rand() - 0.5) * 19;
    const z = (rand() - 0.5) * 15;
    if (Math.hypot(x, z) < 2.2) continue; // keep clear of the game camera
    const size = 0.5 + rand() * 0.5;
    objects.push({
      position: new THREE.Vector3(x, size / 2, z),
      size,
      // Bounding-sphere radius of the box (half its space diagonal).
      radius: (size * Math.sqrt(3)) / 2,
    });
  }
  return objects;
}

const OBJECTS = buildObjects();

/** Frustum edge segments (12 edges, as point pairs) for the wedge outline. */
function frustumEdges(camera: THREE.PerspectiveCamera): THREE.Vector3[] {
  const corners: THREE.Vector3[] = [];
  for (const z of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const x of [-1, 1]) {
        corners.push(new THREE.Vector3(x, y, z).unproject(camera));
      }
    }
  }
  // Index layout: near plane 0..3, far plane 4..7 (x fastest, then y).
  const edges: [number, number][] = [
    [0, 1],
    [1, 3],
    [3, 2],
    [2, 0],
    [4, 5],
    [5, 7],
    [7, 6],
    [6, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  return edges.flatMap(([a, b]) => [corners[a], corners[b]]);
}

export default function FrustumCulling(): React.JSX.Element {
  const [heading, setHeading] = useState(INITIAL.heading);
  const [fov, setFov] = useState(INITIAL.fov);
  const [showCulled, setShowCulled] = useState(INITIAL.showCulled);

  // The invisible "game camera" plus everything derived from it. Objects are
  // static, so culling only needs recomputing when a control changes.
  const { edgePoints, inside, culledCount } = useMemo(() => {
    const camera = new THREE.PerspectiveCamera(fov, GAME_CAM_ASPECT, GAME_CAM_NEAR, GAME_CAM_FAR);
    camera.position.copy(GAME_CAM_POS);
    camera.rotation.y = (heading * Math.PI) / 180;
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    const sphere = new THREE.Sphere();
    const inside = OBJECTS.map((o) => frustum.intersectsSphere(sphere.set(o.position, o.radius)));
    return {
      edgePoints: frustumEdges(camera),
      inside,
      culledCount: inside.filter((v) => !v).length,
    };
  }, [heading, fov]);

  const caption = `${culledCount} of ${OBJECTS.length} objects culled — the GPU never sees them. ${
    showCulled
      ? "The red ghosts fail the frustum test and are skipped before any triangle is drawn."
      : "Culled objects are hidden entirely: from the game camera's point of view they never existed."
  }${fov <= 30 ? " A narrow FOV is a hungry culler." : ""}`;

  return (
    <PlaygroundFrame
      title="Frustum culling, seen from above"
      caption={caption}
      onReset={() => {
        setHeading(INITIAL.heading);
        setFov(INITIAL.fov);
        setShowCulled(INITIAL.showCulled);
      }}
      controls={
        <>
          <SliderControl
            label="Camera heading"
            value={heading}
            min={-180}
            max={180}
            step={1}
            onInput={setHeading}
            format={(v) => `${v}°`}
          />
          <SliderControl
            label="Field of view"
            value={fov}
            min={20}
            max={120}
            step={1}
            onInput={setFov}
            format={(v) => `${v}°`}
          />
          <SwitchControl
            label="Show culled objects"
            checked={showCulled}
            onChange={setShowCulled}
          />
        </>
      }
    >
      <Canvas
        orthographic
        camera={{
          position: [0, 30, 0],
          rotation: [-Math.PI / 2, 0, 0],
          zoom: 22,
          near: 0.1,
          far: 100,
        }}
        dpr={[1, 2]}
      >
        <color attach="background" args={["#14181d"]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 10, 3]} intensity={1.4} />

        {/* ground + grid */}
        <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[26, 22]} />
          <meshStandardMaterial color="#1d232a" />
        </mesh>
        <gridHelper args={[26, 26, "#2c343d", "#242b33"]} position={[0, 0, 0]} />

        {/* the field of boxes, tinted by their culling result */}
        {OBJECTS.map((o, i) =>
          inside[i] ? (
            <mesh key={i} position={o.position}>
              <boxGeometry args={[o.size, o.size, o.size]} />
              <meshStandardMaterial color="#5fb4e8" roughness={0.6} />
            </mesh>
          ) : showCulled ? (
            <mesh key={i} position={o.position}>
              <boxGeometry args={[o.size, o.size, o.size]} />
              <meshStandardMaterial color="#e0452f" transparent opacity={0.28} roughness={0.6} />
            </mesh>
          ) : null,
        )}

        {/* the game camera marker + its frustum wedge */}
        <group position={GAME_CAM_POS} rotation={[0, (heading * Math.PI) / 180, 0]}>
          <mesh>
            <sphereGeometry args={[0.32, 20, 14]} />
            <meshBasicMaterial color="#ffd166" />
          </mesh>
          <mesh position={[0, 0, -0.55]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.2, 0.45, 14]} />
            <meshBasicMaterial color="#ffd166" />
          </mesh>
        </group>
        <Line
          points={edgePoints}
          segments
          color="#ffd166"
          lineWidth={1.5}
          transparent
          opacity={0.85}
        />
      </Canvas>
    </PlaygroundFrame>
  );
}
