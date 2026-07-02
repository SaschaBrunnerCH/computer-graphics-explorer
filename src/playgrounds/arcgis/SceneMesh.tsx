import { useRef, useState } from "react";
import Camera from "@arcgis/core/Camera.js";
import Graphic from "@arcgis/core/Graphic.js";
import Mesh from "@arcgis/core/geometry/Mesh.js";
import Point from "@arcgis/core/geometry/Point.js";
import MeshLocalVertexSpace from "@arcgis/core/geometry/support/MeshLocalVertexSpace.js";
import MeshMaterialMetallicRoughness from "@arcgis/core/geometry/support/MeshMaterialMetallicRoughness.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import FillSymbol3DLayer from "@arcgis/core/symbols/FillSymbol3DLayer.js";
import MeshSymbol3D from "@arcgis/core/symbols/MeshSymbol3D.js";
import PointSymbol3D from "@arcgis/core/symbols/PointSymbol3D.js";
import "@arcgis/map-components/components/arcgis-scene";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl, SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * A mesh, from scratch. Instead of `Mesh.createSphere`, this playground builds
 * the raw arrays a GPU actually consumes: a list of vertex positions, a list of
 * triangles (index triples) wired between them, and a normal per vertex telling
 * the lighting which way each surface faces. Constructing them by hand IS the
 * lesson — the dome floating over Bundesplatz in Bern is just 51 vertices and
 * 90 triangles.
 *
 * Each control pokes a different fundamental: "Show vertices" reveals the raw
 * points; "Normals" swaps faceted (one normal per triangle) for smooth
 * (averaged across shared vertices); "Lift apex" edits a single vertex and lets
 * the normals recompute; "Flip winding" reverses each triangle's vertex order —
 * because SDK meshes are single-sided, the flipped faces get culled and the
 * dome turns see-through, which is exactly what back-face culling does.
 *
 * Everything runs on keyless services (OSM basemap, Esri world elevation).
 */

/** Bundesplatz, Bern — the open square in front of the parliament building. */
const DOME_LON = 7.4441;
const DOME_LAT = 46.9466;
/** Used if the elevation query fails; the square sits at ~540 m. */
const FALLBACK_GROUND_Z = 540;
/** The dome floats this high above the ground so it reads as a free object. */
const DOME_LIFT = 40;
/** Dome radius in meters — big enough to read clearly from the presets. */
const DOME_RADIUS = 25;
/** Low-poly on purpose: the facets are the point. */
const RINGS = 5;
const SEGMENTS = 10;

const MESH_LAYER_ID = "scene-mesh-dome";
const VERTEX_LAYER_ID = "scene-mesh-vertices";

/** Meters per degree of latitude (spherical approximation — fine at 25 m scale). */
const M_PER_DEG_LAT = 111320;
const LAT_RAD = (DOME_LAT * Math.PI) / 180;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos(LAT_RAD);

type Vec3 = [number, number, number];
type NormalMode = "flat" | "smooth";
type CameraPreset = "outside" | "inside";

const CAMERAS: Record<CameraPreset, { position: Vec3; heading: number; tilt: number }> = {
  // ~150 m to the south-east and above, tilted down onto the floating dome.
  outside: { position: [7.4455, 46.94565, 645], heading: 315, tilt: 70 },
  // Under the shell at rim height, looking up into it — with winding flipped
  // you see straight through the near wall to the far one.
  inside: { position: [7.4441, 46.9466, 583], heading: 315, tilt: 110 },
};

/**
 * Build the shared (indexed) dome once, at module load: a UV upper-hemisphere
 * with a single apex vertex and `RINGS` latitude rings of `SEGMENTS` vertices.
 * `triangles` are index triples into `shared`, oriented so the geometric normal
 * of every face points outward (away from the sphere center).
 */
function buildDome(
  rings: number,
  segments: number,
  radius: number,
): { shared: number[]; triangles: Vec3[] } {
  const shared: number[] = [];
  // Vertex 0 is the apex.
  shared.push(0, 0, radius);
  // Rings 1..rings sweep from just below the apex down to the rim (z = 0).
  for (let i = 1; i <= rings; i++) {
    const phi = (i / rings) * (Math.PI / 2);
    const sinP = Math.sin(phi);
    const cosP = Math.cos(phi);
    for (let j = 0; j < segments; j++) {
      const theta = (j / segments) * 2 * Math.PI;
      shared.push(radius * sinP * Math.cos(theta), radius * sinP * Math.sin(theta), radius * cosP);
    }
  }

  const ringStart = (i: number): number => 1 + (i - 1) * segments;
  const triangles: Vec3[] = [];
  // Top fan: apex to each edge of ring 1.
  for (let j = 0; j < segments; j++) {
    triangles.push([0, ringStart(1) + j, ringStart(1) + ((j + 1) % segments)]);
  }
  // Quad strips between successive rings, each split into two triangles.
  for (let i = 1; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const jn = (j + 1) % segments;
      const v00 = ringStart(i) + j;
      const v01 = ringStart(i) + jn;
      const v10 = ringStart(i + 1) + j;
      const v11 = ringStart(i + 1) + jn;
      triangles.push([v00, v10, v11]);
      triangles.push([v00, v11, v01]);
    }
  }

  // Orient every triangle so its front face (CCW) points outward. This makes the
  // default winding a solid shell seen from outside; "Flip winding" undoes it.
  for (const tri of triangles) {
    const n = faceNormal(shared, tri[0], tri[1], tri[2]);
    const cx = (shared[tri[0] * 3] + shared[tri[1] * 3] + shared[tri[2] * 3]) / 3;
    const cy = (shared[tri[0] * 3 + 1] + shared[tri[1] * 3 + 1] + shared[tri[2] * 3 + 1]) / 3;
    const cz = (shared[tri[0] * 3 + 2] + shared[tri[1] * 3 + 2] + shared[tri[2] * 3 + 2]) / 3;
    if (n[0] * cx + n[1] * cy + n[2] * cz < 0) {
      const t = tri[1];
      tri[1] = tri[2];
      tri[2] = t;
    }
  }

  return { shared, triangles };
}

/** Normalized cross product of (p1 - p0) × (p2 - p0) for a triangle. */
function faceNormal(pos: number[], a: number, b: number, c: number): Vec3 {
  const ux = pos[b * 3] - pos[a * 3];
  const uy = pos[b * 3 + 1] - pos[a * 3 + 1];
  const uz = pos[b * 3 + 2] - pos[a * 3 + 2];
  const vx = pos[c * 3] - pos[a * 3];
  const vy = pos[c * 3 + 1] - pos[a * 3 + 1];
  const vz = pos[c * 3 + 2] - pos[a * 3 + 2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

const DOME = buildDome(RINGS, SEGMENTS, DOME_RADIUS);
const UNIQUE_VERTS = DOME.shared.length / 3;
const TRIANGLE_COUNT = DOME.triangles.length;

/**
 * De-index the dome into unshared per-triangle vertices and compute normals for
 * the requested mode. De-indexing (every triangle owns its 3 vertices) is what
 * lets flat and smooth shading — and the winding flip — coexist without touching
 * the face indices, which stay a plain 0,1,2,3,… identity list.
 */
function buildAttributes(
  sharedPos: number[],
  tris: Vec3[],
  mode: NormalMode,
): { positions: Float64Array<ArrayBuffer>; normals: Float32Array<ArrayBuffer> } {
  const numTri = tris.length;
  const positions = new Float64Array(numTri * 9);
  const normals = new Float32Array(numTri * 9);
  const faceNormals = tris.map((t) => faceNormal(sharedPos, t[0], t[1], t[2]));

  // Smooth shading: average adjacent face normals per shared vertex.
  let smooth: Float64Array | null = null;
  if (mode === "smooth") {
    const sharedCount = sharedPos.length / 3;
    const accum = new Float64Array(sharedCount * 3);
    tris.forEach((tri, t) => {
      const fn = faceNormals[t];
      for (const vi of tri) {
        accum[vi * 3] += fn[0];
        accum[vi * 3 + 1] += fn[1];
        accum[vi * 3 + 2] += fn[2];
      }
    });
    for (let i = 0; i < sharedCount; i++) {
      const len = Math.hypot(accum[i * 3], accum[i * 3 + 1], accum[i * 3 + 2]) || 1;
      accum[i * 3] /= len;
      accum[i * 3 + 1] /= len;
      accum[i * 3 + 2] /= len;
    }
    smooth = accum;
  }

  tris.forEach((tri, t) => {
    const fn = faceNormals[t];
    for (let k = 0; k < 3; k++) {
      const vi = tri[k];
      const out = (t * 3 + k) * 3;
      positions[out] = sharedPos[vi * 3];
      positions[out + 1] = sharedPos[vi * 3 + 1];
      positions[out + 2] = sharedPos[vi * 3 + 2];
      if (smooth) {
        normals[out] = smooth[vi * 3];
        normals[out + 1] = smooth[vi * 3 + 1];
        normals[out + 2] = smooth[vi * 3 + 2];
      } else {
        normals[out] = fn[0];
        normals[out + 1] = fn[1];
        normals[out + 2] = fn[2];
      }
    }
  });

  return { positions, normals };
}

/** The warm dielectric shell material — one instance, reused across rebuilds. */
const DOME_MATERIAL = new MeshMaterialMetallicRoughness({
  color: "#d97706",
  metallic: 0,
  roughness: 0.5,
});

/** White-outlined dots marking each raw vertex, billboarded so they never hide. */
const VERTEX_SYMBOL = new PointSymbol3D({
  symbolLayers: [
    {
      type: "icon",
      resource: { primitive: "circle" },
      size: 6,
      material: { color: "#0ea5e9" },
      outline: { color: "#ffffff", size: 1 },
    },
  ],
});

const INITIAL = {
  showVertices: false,
  normalMode: "smooth" as NormalMode,
  apexLift: 0,
  flipped: false,
  preset: "outside" as CameraPreset,
};

type LoadStatus = "loading" | "ready" | "failed";

export default function SceneMesh(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const meshRef = useRef<Mesh | null>(null);
  const vertexLayerRef = useRef<GraphicsLayer | null>(null);
  /** Absolute z of the vertex-space origin (ground + lift), set after the query. */
  const originZRef = useRef<number>(FALLBACK_GROUND_Z + DOME_LIFT);

  // Geometry parameters live in refs too, so imperative rebuilds read fresh
  // values without waiting for a React re-render.
  const showVerticesRef = useRef(INITIAL.showVertices);
  const normalModeRef = useRef<NormalMode>(INITIAL.normalMode);
  const apexLiftRef = useRef(INITIAL.apexLift);
  const flippedRef = useRef(INITIAL.flipped);

  const [showVertices, setShowVertices] = useState(INITIAL.showVertices);
  const [normalMode, setNormalMode] = useState<NormalMode>(INITIAL.normalMode);
  const [apexLift, setApexLift] = useState(INITIAL.apexLift);
  const [flipped, setFlipped] = useState(INITIAL.flipped);
  const [preset, setPreset] = useState<CameraPreset>(INITIAL.preset);
  const [status, setStatus] = useState<LoadStatus>("loading");

  /** True once the view exists; all imperative access goes through this. */
  const readyScene = (): HTMLArcgisSceneElement | null => {
    const el = sceneRef.current;
    return el && el.view ? el : null;
  };

  /** Shared positions with the current apex lift applied to vertex 0. */
  const currentSharedPositions = (): number[] => {
    const pos = DOME.shared.slice();
    pos[2] += apexLiftRef.current;
    return pos;
  };

  /** Triangle list for the current winding (flipped swaps each triple's 2nd/3rd). */
  const currentTriangles = (): Vec3[] =>
    flippedRef.current ? DOME.triangles.map(([a, b, c]) => [a, c, b] as Vec3) : DOME.triangles;

  const goToPreset = (el: HTMLArcgisSceneElement, p: CameraPreset): void => {
    const { position, heading, tilt } = CAMERAS[p];
    const [longitude, latitude, z] = position;
    void el
      .goTo(new Camera({ position: { longitude, latitude, z }, heading, tilt }))
      .catch(() => undefined); // interrupted animations reject — never crash on that
  };

  /** Recompute positions + normals in place from the current parameters. */
  const rebuildMesh = (): void => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const { positions, normals } = buildAttributes(
      currentSharedPositions(),
      currentTriangles(),
      normalModeRef.current,
    );
    // Vertex count is constant (900 = 270 de-indexed × 3), so the face indices
    // stay valid — only the attribute values change.
    mesh.vertexAttributes.position = positions;
    mesh.vertexAttributes.normal = normals;
    mesh.vertexAttributesChanged();
    if (showVerticesRef.current) refreshVertexPoints();
  };

  /** Drop one billboarded dot at each unique vertex, in absolute coordinates. */
  const refreshVertexPoints = (): void => {
    const layer = vertexLayerRef.current;
    if (!layer || layer.destroyed) return;
    layer.removeAll();
    const shared = currentSharedPositions();
    const originZ = originZRef.current;
    for (let i = 0; i < UNIQUE_VERTS; i++) {
      const east = shared[i * 3];
      const north = shared[i * 3 + 1];
      const up = shared[i * 3 + 2];
      const point = new Point({
        longitude: DOME_LON + east / M_PER_DEG_LON,
        latitude: DOME_LAT + north / M_PER_DEG_LAT,
        z: originZ + up,
      });
      layer.add(new Graphic({ geometry: point, symbol: VERTEX_SYMBOL }));
    }
  };

  /** Query the ground, place the origin, build the mesh, add it as a graphic. */
  const addDome = async (el: HTMLArcgisSceneElement, layer: GraphicsLayer): Promise<void> => {
    let groundZ = FALLBACK_GROUND_Z;
    const ground = el.map?.ground;
    if (ground) {
      try {
        const query = await ground.queryElevation(
          new Point({ longitude: DOME_LON, latitude: DOME_LAT }),
        );
        groundZ = query.geometry.z ?? FALLBACK_GROUND_Z;
      } catch {
        // keep the fallback elevation
      }
    }
    // The view may have been torn down (StrictMode) while we were loading.
    if (!el.view || layer.destroyed) return;
    originZRef.current = groundZ + DOME_LIFT;

    const { positions, normals } = buildAttributes(
      currentSharedPositions(),
      currentTriangles(),
      normalModeRef.current,
    );
    const faces = new Uint32Array(TRIANGLE_COUNT * 3);
    for (let i = 0; i < faces.length; i++) faces[i] = i;

    const mesh = new Mesh({
      vertexSpace: new MeshLocalVertexSpace({ origin: [DOME_LON, DOME_LAT, originZRef.current] }),
      vertexAttributes: { position: positions, normal: normals },
      components: [{ faces, material: DOME_MATERIAL, shading: "source" }],
    });
    meshRef.current = mesh;

    if (layer.graphics.length === 0) {
      layer.add(
        new Graphic({
          geometry: mesh,
          symbol: new MeshSymbol3D({ symbolLayers: [new FillSymbol3DLayer()] }),
        }),
      );
    }
    setStatus("ready");
  };

  const handleViewReady = (event: { target: HTMLArcgisSceneElement }): void => {
    const el = event.target;
    // StrictMode double-mounts can re-fire this; add the layers only once.
    if (el.map && !el.map.findLayerById(MESH_LAYER_ID)) {
      const meshLayer = new GraphicsLayer({
        id: MESH_LAYER_ID,
        listMode: "hide",
        elevationInfo: { mode: "absolute-height" },
      });
      const vertexLayer = new GraphicsLayer({
        id: VERTEX_LAYER_ID,
        listMode: "hide",
        elevationInfo: { mode: "absolute-height" },
      });
      el.map.add(meshLayer);
      el.map.add(vertexLayer);
      vertexLayerRef.current = vertexLayer;
      void addDome(el, meshLayer).catch(() => setStatus("failed"));
    }
  };

  const caption =
    status === "failed"
      ? "The mesh failed to build — reload the page to retry."
      : `${status === "loading" ? "Building the mesh… " : ""}A dome wired by hand from raw arrays: ${UNIQUE_VERTS} vertices joined into ${TRIANGLE_COUNT} triangles, floating ${DOME_LIFT} m over Bundesplatz. Normals are ${
          normalMode === "smooth"
            ? "averaged across shared vertices, so the low-poly shell reads rounded"
            : "one per triangle, so every facet stays sharp"
        }; winding is ${
          flipped
            ? "reversed — the SDK culls the now back-facing triangles, so the dome turns see-through from outside"
            : "outward-facing, so it reads as a solid shell"
        }.`;

  const resetAll = (): void => {
    showVerticesRef.current = INITIAL.showVertices;
    normalModeRef.current = INITIAL.normalMode;
    apexLiftRef.current = INITIAL.apexLift;
    flippedRef.current = INITIAL.flipped;
    setShowVertices(INITIAL.showVertices);
    setNormalMode(INITIAL.normalMode);
    setApexLift(INITIAL.apexLift);
    setFlipped(INITIAL.flipped);
    setPreset(INITIAL.preset);
    rebuildMesh();
    vertexLayerRef.current?.removeAll();
    const el = readyScene();
    if (el) goToPreset(el, INITIAL.preset);
  };

  return (
    <PlaygroundFrame
      title="A hand-built mesh over Bundesplatz, Bern"
      caption={caption}
      onReset={resetAll}
      controls={
        <>
          <SwitchControl
            label="Show vertices"
            checked={showVertices}
            onChange={(v) => {
              showVerticesRef.current = v;
              setShowVertices(v);
              if (v) refreshVertexPoints();
              else vertexLayerRef.current?.removeAll();
            }}
          />
          <SegmentedControl<NormalMode>
            label="Normals"
            value={normalMode}
            options={[
              { value: "flat", label: "Flat" },
              { value: "smooth", label: "Smooth" },
            ]}
            onChange={(m) => {
              normalModeRef.current = m;
              setNormalMode(m);
              rebuildMesh();
            }}
          />
          <SliderControl
            label="Lift apex"
            value={apexLift}
            min={0}
            max={20}
            step={1}
            format={(v) => `${v} m`}
            onInput={(v) => {
              apexLiftRef.current = v;
              setApexLift(v);
              rebuildMesh();
            }}
          />
          <SwitchControl
            label="Flip winding"
            checked={flipped}
            onChange={(v) => {
              flippedRef.current = v;
              setFlipped(v);
              rebuildMesh();
            }}
          />
          <SegmentedControl<CameraPreset>
            label="Camera"
            value={preset}
            options={[
              { value: "outside", label: "Outside" },
              { value: "inside", label: "Inside" },
            ]}
            onChange={(p) => {
              setPreset(p);
              const el = readyScene();
              if (el) goToPreset(el, p);
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            This dome is just three arrays: vertex positions, triangles that index them, and one
            normal per vertex for lighting. Flat shading gives each triangle a single normal (sharp
            facets); smooth averages them across shared vertices (rounded). Flip the winding and the
            triangles face inward — the engine draws only front faces, so the shell vanishes from
            outside. Switch to the inside camera to see straight through it.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="osm"
        ground="world-elevation"
        cameraPosition="7.4455, 46.94565, 645"
        cameraHeading={CAMERAS.outside.heading}
        cameraTilt={CAMERAS.outside.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
    </PlaygroundFrame>
  );
}
