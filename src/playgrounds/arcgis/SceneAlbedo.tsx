import { useRef, useState } from "react";
import Camera from "@arcgis/core/Camera.js";
import Graphic from "@arcgis/core/Graphic.js";
import Mesh from "@arcgis/core/geometry/Mesh.js";
import Point from "@arcgis/core/geometry/Point.js";
import MeshMaterialMetallicRoughness from "@arcgis/core/geometry/support/MeshMaterialMetallicRoughness.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import FillSymbol3DLayer from "@arcgis/core/symbols/FillSymbol3DLayer.js";
import MeshSymbol3D from "@arcgis/core/symbols/MeshSymbol3D.js";
import "@arcgis/map-components/components/arcgis-scene";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Nine identical spheres, one albedo, nine surfaces. A 3×3 grid of
 * `Mesh.createSphere` primitives hovers over the Ouchy lakeside promenade in
 * Lausanne, each sphere carrying a `MeshMaterialMetallicRoughness` material
 * with the *same* base color but a different metallic/roughness pair:
 *
 *   - columns (west→east / screen left→right): roughness 0.05 → 0.5 → 0.95
 *   - rows    (south→north / screen bottom→top): metallic 0.0 → 0.5 → 1.0
 *
 * The albedo swatch recolors all nine at once, and the time-of-day slider
 * moves `environment.lighting.date` (SunLighting, same approach as GltfPbr) so
 * the specular reflection sweeps across every sphere while the diffuse base
 * hue stays put — albedo is light-invariant, reflection is view/light-dependent.
 */

const GRID_LAYER_ID = "scene-albedo-grid";

/** Ouchy promenade, Lausanne — the lake shore below the old town. */
const GRID_LON = 6.6266;
const GRID_LAT = 46.506;
/** Used if the elevation query fails; the promenade sits at ~375 m. */
const FALLBACK_GROUND_Z = 375;

const SPACING = 8; // metres between sphere centers
const RADIUS = 3; // sphere radius in metres
const HOVER = 2; // clearance from ground to the bottom of each sphere

/** Columns, west→east: smooth mirror → matte. Screen left→right. */
const ROUGHNESS = [0.05, 0.5, 0.95] as const;
/** Rows, south→north: dielectric → full metal. Screen bottom→top. */
const METALLIC = [0.0, 0.5, 1.0] as const;

/** One metre expressed in degrees of latitude (spherical approximation). */
const M_PER_DEG_LAT = 111320;
/** Metres per degree of longitude at the grid's latitude. */
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((GRID_LAT * Math.PI) / 180);

type AlbedoKey = "crimson" | "gold" | "teal" | "chalk";

const ALBEDOS: Record<AlbedoKey, { label: string; hex: string }> = {
  crimson: { label: "Crimson", hex: "#dc2626" },
  gold: { label: "Gold", hex: "#f59e0b" },
  teal: { label: "Teal", hex: "#0d9488" },
  chalk: { label: "Chalk", hex: "#f5f5f4" },
};

type CameraPreset = "grid" | "close";

const CAMERAS: Record<
  CameraPreset,
  { position: [number, number, number]; heading: number; tilt: number }
> = {
  // From the south-west, looking north-east across the grid diagonal — all
  // nine spheres separate visually instead of hiding behind each other.
  grid: { position: [6.6259, 46.50555, 389], heading: 42, tilt: 75 },
  // Right up against the rough-metal corner sphere (top-right: east + north).
  close: { position: [6.62675, 46.50596, 382], heading: 320, tilt: 80 },
};

/** Local Lausanne hour (UTC+2 in June) → Date for the sun position. */
const dateForHour = (hour: number): Date =>
  new Date(Date.UTC(2026, 5, 21, 0, Math.round(hour * 60) - 120));

const formatHour = (hour: number): string => {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const INITIAL = { albedo: "crimson" as AlbedoKey, hour: 16, preset: "grid" as CameraPreset };

/** One sphere Graphic for grid cell (col, row), colored by the current albedo. */
const sphereGraphic = (groundZ: number, col: number, row: number, hex: string): Graphic => {
  const eastM = (col - 1) * SPACING;
  const northM = (row - 1) * SPACING;
  const location = new Point({
    longitude: GRID_LON + eastM / M_PER_DEG_LON,
    latitude: GRID_LAT + northM / M_PER_DEG_LAT,
    // createSphere places the sphere on its bottom center, so lift by HOVER only.
    z: groundZ + HOVER,
  });
  const mesh = Mesh.createSphere(location, {
    size: RADIUS * 2,
    densificationFactor: 2,
    vertexSpace: "local",
    material: new MeshMaterialMetallicRoughness({
      color: hex,
      metallic: METALLIC[row],
      roughness: ROUGHNESS[col],
    }),
  });
  return new Graphic({
    geometry: mesh,
    symbol: new MeshSymbol3D({ symbolLayers: [new FillSymbol3DLayer()] }),
  });
};

export default function SceneAlbedo(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const [albedo, setAlbedo] = useState<AlbedoKey>(INITIAL.albedo);
  const [hour, setHour] = useState(INITIAL.hour);
  const [preset, setPreset] = useState<CameraPreset>(INITIAL.preset);

  /** Ground elevation resolved once from the query; grid rebuilds read it. */
  const groundZRef = useRef(FALLBACK_GROUND_Z);
  /** Current albedo hex, kept in a ref so rebuilds never see a stale color. */
  const albedoRef = useRef(ALBEDOS[INITIAL.albedo].hex);

  /** True once the view exists; all imperative access goes through this. */
  const readyScene = (): HTMLArcgisSceneElement | null => {
    const el = sceneRef.current;
    return el && el.view ? el : null;
  };

  const gridLayer = (el: HTMLArcgisSceneElement): GraphicsLayer | null =>
    (el.map?.findLayerById(GRID_LAYER_ID) as GraphicsLayer | undefined) ?? null;

  const applySun = (el: HTMLArcgisSceneElement, h: number): void => {
    const lighting = el.environment.lighting;
    if (lighting.type === "sun") lighting.date = dateForHour(h);
  };

  const goToPreset = (el: HTMLArcgisSceneElement, p: CameraPreset): void => {
    const { position, heading, tilt } = CAMERAS[p];
    const [longitude, latitude, z] = position;
    void el
      .goTo(new Camera({ position: { longitude, latitude, z }, heading, tilt }))
      .catch(() => undefined); // interrupted animations reject — never crash on that
  };

  /** Replace all nine graphics — the reliable re-render path for a color change. */
  const rebuildGrid = (el: HTMLArcgisSceneElement, layer: GraphicsLayer, hex: string): void => {
    if (!el.view || layer.destroyed) return;
    layer.removeAll();
    const groundZ = groundZRef.current;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        layer.add(sphereGraphic(groundZ, col, row, hex));
      }
    }
  };

  /** Resolve ground elevation, then lay down the initial grid. */
  const populateGrid = async (el: HTMLArcgisSceneElement, layer: GraphicsLayer): Promise<void> => {
    const ground = el.map?.ground;
    if (ground) {
      try {
        const query = await ground.queryElevation(
          new Point({ longitude: GRID_LON, latitude: GRID_LAT }),
        );
        groundZRef.current = query.geometry.z ?? FALLBACK_GROUND_Z;
      } catch {
        // keep the fallback elevation
      }
    }
    // The view may have been torn down (StrictMode) while we were querying.
    if (!el.view || layer.destroyed) return;
    rebuildGrid(el, layer, albedoRef.current);
  };

  const handleViewReady = (event: { target: HTMLArcgisSceneElement }): void => {
    const el = event.target;
    el.environment.lighting = {
      type: "sun",
      date: dateForHour(hour),
      directShadowsEnabled: true,
    };
    // StrictMode double-mounts can re-fire this; add the layer only once.
    if (el.map && !el.map.findLayerById(GRID_LAYER_ID)) {
      const layer = new GraphicsLayer({
        id: GRID_LAYER_ID,
        listMode: "hide",
        elevationInfo: { mode: "absolute-height" },
      });
      el.map.add(layer);
      void populateGrid(el, layer);
    }
  };

  const albedoLabel = ALBEDOS[albedo].label;
  const caption =
    `Albedo = ${albedoLabel} on all nine — same base color, nine different surfaces. ` +
    `Left→right the roughness climbs 0.05 → 0.95, blurring the sun's reflection; ` +
    `bottom→top the metalness climbs 0 → 1, replacing the diffuse ${albedoLabel.toLowerCase()} ` +
    `with a tinted mirror. Bottom-right (rough dielectric) is almost pure diffuse albedo; ` +
    `top-left (smooth metal) is a near-pure specular mirror. Sun at ${formatHour(hour)}.`;

  return (
    <PlaygroundFrame
      title="Nine spheres over Lake Geneva — one albedo, nine surfaces"
      caption={caption}
      onReset={() => {
        setAlbedo(INITIAL.albedo);
        setHour(INITIAL.hour);
        setPreset(INITIAL.preset);
        albedoRef.current = ALBEDOS[INITIAL.albedo].hex;
        const el = readyScene();
        if (!el) return;
        el.environment.lighting = {
          type: "sun",
          date: dateForHour(INITIAL.hour),
          directShadowsEnabled: true,
        };
        const layer = gridLayer(el);
        if (layer) rebuildGrid(el, layer, albedoRef.current);
        goToPreset(el, INITIAL.preset);
      }}
      controls={
        <>
          <SegmentedControl<AlbedoKey>
            label="Albedo"
            value={albedo}
            options={[
              { value: "crimson", label: "Crimson" },
              { value: "gold", label: "Gold" },
              { value: "teal", label: "Teal" },
              { value: "chalk", label: "Chalk" },
            ]}
            onChange={(a) => {
              setAlbedo(a);
              const hex = ALBEDOS[a].hex;
              albedoRef.current = hex;
              const el = readyScene();
              const layer = el && gridLayer(el);
              if (el && layer) rebuildGrid(el, layer, hex);
            }}
          />
          <SliderControl
            label="Sun time of day"
            value={hour}
            min={6}
            max={21}
            step={0.25}
            format={formatHour}
            onInput={(h) => {
              setHour(h);
              const el = readyScene();
              if (el) applySun(el, h);
            }}
          />
          <SegmentedControl<CameraPreset>
            label="Camera"
            value={preset}
            options={[
              { value: "grid", label: "Grid" },
              { value: "close", label: "Close" },
            ]}
            onChange={(p) => {
              setPreset(p);
              const el = readyScene();
              if (el) goToPreset(el, p);
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Diffuse is light scattered inside the surface, tinted by the albedo; specular is the
            mirror-like bounce at the surface, sharp when smooth and blurred when rough. Metals have
            almost no diffuse — their albedo tints the reflection instead of a matte body color.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="osm"
        ground="world-elevation"
        cameraPosition="6.6259, 46.50555, 389"
        cameraHeading={CAMERAS.grid.heading}
        cameraTilt={CAMERAS.grid.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
    </PlaygroundFrame>
  );
}
