import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";

/**
 * Mesh inspector: one torus knot with every layer of "what a mesh really is"
 * toggleable — vertex dots, wireframe edges, per-vertex normal arrows, and a
 * flat ↔ smooth normal rebuild. Serves vertex, triangle-mesh, normal-vectors.
 */

const INITIAL = { detail: 10, vertices: true, wireframe: true, normals: true, flat: false };

const NORMAL_LENGTH = 0.16;

/** Detail slider → torus-knot segment counts; flat rebuilds with un-shared vertices. */
function buildKnot(detail: number, flat: boolean): THREE.BufferGeometry {
  const tubularSegments = detail * 3;
  const radialSegments = Math.max(4, Math.round(detail / 2));
  const indexed = new THREE.TorusKnotGeometry(1, 0.35, tubularSegments, radialSegments);
  if (!flat) return indexed;
  // Flat shading needs one hard normal per triangle, so first un-share the
  // vertices; computeVertexNormals on non-indexed data yields face normals.
  const unindexed = indexed.toNonIndexed();
  indexed.dispose();
  unindexed.computeVertexNormals();
  return unindexed;
}

/** Line-segment geometry: one short green arrow per vertex, along its normal. */
function buildNormalLines(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const points = new Float32Array(position.count * 6);
  for (let i = 0; i < position.count; i++) {
    const o = i * 6;
    points[o] = position.getX(i);
    points[o + 1] = position.getY(i);
    points[o + 2] = position.getZ(i);
    points[o + 3] = points[o] + normal.getX(i) * NORMAL_LENGTH;
    points[o + 4] = points[o + 1] + normal.getY(i) * NORMAL_LENGTH;
    points[o + 5] = points[o + 2] + normal.getZ(i) * NORMAL_LENGTH;
  }
  const lines = new THREE.BufferGeometry();
  lines.setAttribute("position", new THREE.BufferAttribute(points, 3));
  return lines;
}

export default function MeshInspector(): React.JSX.Element {
  const [detail, setDetail] = useState(INITIAL.detail);
  const [vertices, setVertices] = useState(INITIAL.vertices);
  const [wireframe, setWireframe] = useState(INITIAL.wireframe);
  const [normals, setNormals] = useState(INITIAL.normals);
  const [flat, setFlat] = useState(INITIAL.flat);

  const geometry = useMemo(() => buildKnot(detail, flat), [detail, flat]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const normalsGeometry = useMemo(
    () => (normals ? buildNormalLines(geometry) : null),
    [geometry, normals],
  );
  useEffect(
    () => () => {
      normalsGeometry?.dispose();
    },
    [normalsGeometry],
  );

  const vertexCount = geometry.getAttribute("position").count;
  const triangleCount = geometry.index ? geometry.index.count / 3 : vertexCount / 3;

  const overlays = [
    vertices && "yellow vertex dots",
    wireframe && "wireframe edges",
    normals && "green normal arrows",
  ]
    .filter(Boolean)
    .join(", ");
  const caption = `${vertexCount.toLocaleString()} vertices · ${triangleCount.toLocaleString()} triangles. ${
    flat
      ? "Flat normals: every triangle owns its three corners with one hard normal — that is why the vertex count jumped to 3 × triangles."
      : "Smooth normals: neighbouring triangles share vertices, and each shared vertex averages their normals."
  } ${overlays ? `Showing ${overlays}.` : "All overlays off — just the shaded surface."}`;

  return (
    <PlaygroundFrame
      title="Anatomy of a triangle mesh"
      caption={caption}
      onReset={() => {
        setDetail(INITIAL.detail);
        setVertices(INITIAL.vertices);
        setWireframe(INITIAL.wireframe);
        setNormals(INITIAL.normals);
        setFlat(INITIAL.flat);
      }}
      controls={
        <>
          <SliderControl
            label="Detail"
            value={detail}
            min={4}
            max={32}
            step={2}
            onInput={setDetail}
          />
          <SwitchControl label="Vertex dots" checked={vertices} onChange={setVertices} />
          <SwitchControl label="Wireframe" checked={wireframe} onChange={setWireframe} />
          <SwitchControl label="Normal arrows" checked={normals} onChange={setNormals} />
          <SwitchControl label="Flat normals" checked={flat} onChange={setFlat} />
        </>
      }
    >
      <Canvas camera={{ position: [0, 1.4, 4.4], fov: 50 }} dpr={[1, 2]}>
        <color attach="background" args={["#1b1f24"]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[4, 6, 3]} intensity={1.8} />
        <directionalLight position={[-4, -2, -3]} intensity={0.4} />

        <mesh geometry={geometry}>
          <meshStandardMaterial
            color="#4f9edb"
            roughness={0.45}
            polygonOffset
            polygonOffsetFactor={1}
            polygonOffsetUnits={1}
          />
        </mesh>

        {wireframe && (
          <mesh geometry={geometry}>
            <meshBasicMaterial wireframe color="#e8eef4" transparent opacity={0.35} />
          </mesh>
        )}

        {vertices && (
          <points geometry={geometry}>
            <pointsMaterial color="#ffd166" size={0.045} sizeAttenuation />
          </points>
        )}

        {normalsGeometry && (
          <lineSegments geometry={normalsGeometry}>
            <lineBasicMaterial color="#74d99f" transparent opacity={0.9} />
          </lineSegments>
        )}

        <OrbitControls enablePan={false} minDistance={2} maxDistance={10} />
      </Canvas>
    </PlaygroundFrame>
  );
}
