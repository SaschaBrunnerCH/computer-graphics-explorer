import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";
import { createHeightMapTexture, createNormalMapTexture } from "./lib/heightmap";

const INITIAL = { segments: 128, scale: 0.3, wireframe: false };

function DisplacedSlab({
  segments,
  scale,
  wireframe,
}: {
  segments: number;
  scale: number;
  wireframe: boolean;
}): React.JSX.Element {
  // Same procedural brick maps as the normal-mapping demo — here the height
  // map moves real vertices instead of only fooling the lighting.
  // The small offset keeps the vertex grid from lining up exactly with the
  // mortar grid at low subdivisions (which would alias the bricks away into
  // a deceptively flat plane). Both maps must share it to stay aligned.
  const heightTexture = useMemo(() => {
    const texture = createHeightMapTexture();
    texture.offset.set(0.07, 0.045);
    return texture;
  }, []);
  const normalTexture = useMemo(() => {
    const texture = createNormalMapTexture();
    texture.offset.set(0.07, 0.045);
    return texture;
  }, []);
  useEffect(() => () => heightTexture.dispose(), [heightTexture]);
  useEffect(() => () => normalTexture.dispose(), [normalTexture]);

  return (
    <mesh rotation={[-Math.PI / 2.6, 0, 0]}>
      {/* Changing args makes r3f rebuild the geometry and dispose the old one
          — this re-tessellation is the whole lesson of the segments slider. */}
      <planeGeometry args={[3, 3, segments, segments]} />
      <meshStandardMaterial
        color="#b0623f"
        roughness={0.85}
        metalness={0.05}
        displacementMap={heightTexture}
        displacementScale={scale}
        normalMap={normalTexture}
        wireframe={wireframe}
      />
    </mesh>
  );
}

function buildCaption(segments: number, scale: number, wireframe: boolean): string {
  if (scale === 0) {
    return "Displacement scale 0: a flat plane. Same brick height map as the normal-mapping demo — but here nothing happens until vertices actually move.";
  }
  const vertices = ((segments + 1) ** 2).toLocaleString("en-US");
  const wire = wireframe
    ? " The wireframe shows exactly how many triangles are doing the work."
    : "";
  if (segments <= 16) {
    return `Only ${segments}×${segments} segments (${vertices} vertices) — the geometry can't keep up with the map, so the bricks melt into blocky lumps; the shading still paints crisp bricks because the normal map works per pixel.${wire}`;
  }
  if (segments >= 128) {
    return `${segments}×${segments} segments (${vertices} vertices): unlike a normal map, the silhouette genuinely changes — the bumps along the edge are real geometry.${wire}`;
  }
  return `Real vertex displacement at ${segments}×${segments} segments (${vertices} vertices). Drop the subdivisions to watch the geometry stop keeping up with the map.${wire}`;
}

export default function Displacement(): React.JSX.Element {
  const [segments, setSegments] = useState(INITIAL.segments);
  const [scale, setScale] = useState(INITIAL.scale);
  const [wireframe, setWireframe] = useState(INITIAL.wireframe);

  return (
    <PlaygroundFrame
      title="Real displacement: the map moves vertices"
      caption={buildCaption(segments, scale, wireframe)}
      onReset={() => {
        setSegments(INITIAL.segments);
        setScale(INITIAL.scale);
        setWireframe(INITIAL.wireframe);
      }}
      controls={
        <>
          <SliderControl
            label="Subdivisions (tessellation)"
            value={segments}
            min={4}
            max={256}
            onInput={setSegments}
            format={(v) => `${v}×${v}`}
          />
          <SliderControl
            label="Displacement scale"
            value={scale}
            min={0}
            max={0.6}
            step={0.05}
            onInput={setScale}
            format={(v) => v.toFixed(2)}
          />
          <SwitchControl label="Wireframe" checked={wireframe} onChange={setWireframe} />
        </>
      }
    >
      <Canvas camera={{ position: [0, 1.1, 3.1], fov: 45 }} dpr={[1, 2]}>
        <color attach="background" args={["#171b21"]} />
        <ambientLight intensity={0.25} />
        <directionalLight position={[2.5, 3.5, 2]} intensity={2} />
        <DisplacedSlab segments={segments} scale={scale} wireframe={wireframe} />
        <OrbitControls enablePan={false} minDistance={1.5} maxDistance={9} />
      </Canvas>
    </PlaygroundFrame>
  );
}
