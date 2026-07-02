import { useRef, useState } from "react";
import Camera from "@arcgis/core/Camera.js";
import Graphic from "@arcgis/core/Graphic.js";
import Mesh from "@arcgis/core/geometry/Mesh.js";
import Point from "@arcgis/core/geometry/Point.js";
import Polygon from "@arcgis/core/geometry/Polygon.js";
import MeshMaterialMetallicRoughness from "@arcgis/core/geometry/support/MeshMaterialMetallicRoughness.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import FillSymbol3DLayer from "@arcgis/core/symbols/FillSymbol3DLayer.js";
import MeshSymbol3D from "@arcgis/core/symbols/MeshSymbol3D.js";
import PolygonSymbol3D from "@arcgis/core/symbols/PolygonSymbol3D.js";
import "@arcgis/map-components/components/arcgis-scene";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * The engine's water reflections are SCREEN-SPACE: the water shader mirrors the
 * scene by re-sampling the frame that was just rendered to the color buffer.
 * That makes them cheap and sharp — but they can only reflect what is currently
 * on screen. Anything off-screen (or occluded) has no source pixel and simply
 * cannot appear in the reflection. This playground makes that failure literal.
 *
 * We build the whole waterfront ourselves over flat terrain in the plain near
 * Greifensee (east of Zurich): a large calm water polygon (WaterSymbol3DLayer,
 * verified in @arcgis/core v5 typings — a polygon symbolized with a
 * PolygonSymbol3D containing a `type: "water"` symbol layer) and our own bright
 * crimson tower (Mesh.createBox, 15×15 m footprint × 120 m tall) standing at the
 * water's edge. Two camera presets share the SAME position and heading and
 * differ only in tilt:
 *
 *   1. "Tower in frame" — a low camera across the water looks slightly down
 *      (tilt 88°); the tower is fully above the horizon and its reflection
 *      stretches all the way toward the camera on the calm surface.
 *   2. "Tower leaving frame" — same eye, pitched down (tilt 75°) so the tall
 *      tower's upper half exits the TOP of the frame. The near water that held
 *      the top's reflection is still fully in view, but its source pixels are
 *      gone — so the reflection truncates. That is THE tell-tale SSR artifact.
 *
 * Geometry (ENU meters from the water centre, +north / +east):
 *   water rectangle: east −300..+300, north −200..+200, at ground z + 0.5 m.
 *   tower centre:    (0, −200) — the south edge midpoint, base on the ground.
 *   camera (both):   (0, +220), 15 m up, heading 180° (due south) → 420 m to
 *                    the tower; a 120 m tower then tops out at +14° elevation.
 *   The virtual (mirror) tower runs from z=0 down to z=−120; the line from the
 *   eye to its top (north −200, z −120) crosses the water plane at north ≈ +173,
 *   i.e. only ~47 m in front of the camera at a steep −18° look-down. Preset 2's
 *   tilt of 75° keeps that near water well inside the frame while cutting the
 *   real tower off above ~+7.5° — so the reflection's mirror stays on screen
 *   while its subject leaves, and the top of the reflection vanishes.
 *
 * Reflections only render at the scene's high quality profile, so the
 * <arcgis-scene> forces qualityProfile="high". Keyless services only (OSM
 * basemap + Esri world elevation).
 */

/** Centre of the self-built waterfront: flat plain near Greifensee, east of Zurich. */
const WATER_LON = 8.655;
const WATER_LAT = 47.34;
/** Used if the elevation query fails; the plain sits at ~440 m. */
const FALLBACK_GROUND_Z = 440;

const LAYER_ID = "water-ssr-scene";

/** Meters per degree (spherical approximation — fine at a few hundred metres). */
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((WATER_LAT * Math.PI) / 180);

/** Local east/north offset in metres → [longitude, latitude]. */
const enu = (east: number, north: number): [number, number] => [
  WATER_LON + east / M_PER_DEG_LON,
  WATER_LAT + north / M_PER_DEG_LAT,
];

/** Water body half-extents: 600 m (E–W) × 400 m (N–S). */
const HALF_EW = 300;
const HALF_NS = 200;

/** Tower: 15×15 m footprint, 120 m tall, standing on the south water edge. */
const TOWER_SIZE = { width: 15, depth: 15, height: 120 } as const;
const TOWER_NORTH = -HALF_NS; // south edge midpoint

type Preset = "in-frame" | "leaving";
type WaveSetting = "calm" | "moderate";

/**
 * Both presets share eye position and heading; only tilt differs. Positions are
 * kept in local ENU + height-above-ground so the real (queried) terrain height
 * is applied at goTo time.
 */
const PRESETS: Record<
  Preset,
  { east: number; north: number; up: number; heading: number; tilt: number }
> = {
  // Low across the water, looking due south, tilted slightly down to catch both
  // the tower (top at +14°) and its full reflection (near edge at −18°).
  "in-frame": { east: 0, north: 220, up: 15, heading: 180, tilt: 88 },
  // Same eye, pitched down 13° more: the tower's upper half leaves the top edge
  // while the near water holding its reflection stays fully framed.
  leaving: { east: 0, north: 220, up: 15, heading: 180, tilt: 75 },
};

/** Initial <arcgis-scene> camera string, using the fallback ground height. */
const [INIT_LON, INIT_LAT] = enu(PRESETS["in-frame"].east, PRESETS["in-frame"].north);
const INIT_CAMERA = `${INIT_LON}, ${INIT_LAT}, ${FALLBACK_GROUND_Z + PRESETS["in-frame"].up}`;

const INITIAL = { preset: "in-frame" as Preset, rippled: false };

/** Navy calm/moderate water symbol; a fresh instance so React state stays honest. */
const makeWaterSymbol = (waves: WaveSetting): PolygonSymbol3D =>
  new PolygonSymbol3D({
    symbolLayers: [
      {
        type: "water",
        color: "#1e3a5f",
        waterbodySize: "large",
        waveStrength: waves,
      },
    ],
  });

/** Rectangle ring at absolute height `z` (ground + 0.5 m avoids z-fighting terrain). */
const makeWaterRings = (z: number): number[][][] => {
  const [wLon, sLat] = enu(-HALF_EW, -HALF_NS);
  const [eLon, nLat] = enu(HALF_EW, HALF_NS);
  return [
    [
      [wLon, sLat, z],
      [eLon, sLat, z],
      [eLon, nLat, z],
      [wLon, nLat, z],
      [wLon, sLat, z],
    ],
  ];
};

/** Empty fill layer keeps the box's own crimson PBR material untinted. */
const towerSymbol = (): MeshSymbol3D =>
  new MeshSymbol3D({ symbolLayers: [new FillSymbol3DLayer()] });

type LoadStatus = "loading" | "ready" | "failed";

export default function WaterSsr(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const waterGraphicRef = useRef<Graphic | null>(null);
  /** Absolute ground height at the site, set after the elevation query. */
  const groundZRef = useRef<number>(FALLBACK_GROUND_Z);
  const [preset, setPreset] = useState<Preset>(INITIAL.preset);
  const [rippled, setRippled] = useState(INITIAL.rippled);
  const [status, setStatus] = useState<LoadStatus>("loading");

  /** True once the view exists; all imperative access goes through this. */
  const readyScene = (): HTMLArcgisSceneElement | null => {
    const el = sceneRef.current;
    return el && el.view ? el : null;
  };

  const applyWaves = (r: boolean): void => {
    const graphic = waterGraphicRef.current;
    if (graphic) graphic.symbol = makeWaterSymbol(r ? "moderate" : "calm");
  };

  const goToPreset = (el: HTMLArcgisSceneElement, p: Preset): void => {
    const { east, north, up, heading, tilt } = PRESETS[p];
    const [longitude, latitude] = enu(east, north);
    void el
      .goTo(
        new Camera({
          position: { longitude, latitude, z: groundZRef.current + up },
          heading,
          tilt,
        }),
      )
      .catch(() => undefined); // interrupted animations reject — never crash on that
  };

  /** Query the ground, build the water polygon + crimson tower, add both. */
  const addScene = async (el: HTMLArcgisSceneElement, layer: GraphicsLayer): Promise<void> => {
    let groundZ = FALLBACK_GROUND_Z;
    const ground = el.map?.ground;
    if (ground) {
      try {
        const query = await ground.queryElevation(
          new Point({ longitude: WATER_LON, latitude: WATER_LAT }),
        );
        groundZ = query.geometry.z ?? FALLBACK_GROUND_Z;
      } catch {
        // keep the fallback elevation
      }
    }
    // The view may have been torn down (StrictMode) while we were querying.
    if (!el.view || layer.destroyed) return;
    groundZRef.current = groundZ;

    if (layer.graphics.length === 0) {
      const water = new Graphic({
        geometry: new Polygon({ rings: makeWaterRings(groundZ + 0.5) }),
        symbol: makeWaterSymbol(rippled ? "moderate" : "calm"),
      });
      // Box origin is at the box centre, so lift by half the height to stand it
      // on the ground with its base at groundZ and its top at groundZ + 120.
      const [towerLon, towerLat] = enu(0, TOWER_NORTH);
      const anchor = new Point({
        longitude: towerLon,
        latitude: towerLat,
        z: groundZ + TOWER_SIZE.height / 2,
      });
      const tower = Mesh.createBox(anchor, {
        size: { ...TOWER_SIZE },
        vertexSpace: "local",
        // Opaque crimson — default alphaMode is correct for a fully opaque colour.
        material: new MeshMaterialMetallicRoughness({
          color: "#dc143c",
          roughness: 0.6,
          metallic: 0,
        }),
      });
      layer.add(water);
      layer.add(new Graphic({ geometry: tower, symbol: towerSymbol() }));
      waterGraphicRef.current = water;
    } else {
      waterGraphicRef.current = layer.graphics.at(0) ?? null;
    }
    setStatus("ready");
    // Re-settle the camera now that the true ground height is known.
    goToPreset(el, INITIAL.preset);
  };

  const handleViewReady = (event: { target: HTMLArcgisSceneElement }): void => {
    const el = event.target;
    // StrictMode double-mounts can re-fire this; add the layer only once.
    if (el.map && !el.map.findLayerById(LAYER_ID)) {
      const layer = new GraphicsLayer({
        id: LAYER_ID,
        listMode: "hide",
        elevationInfo: { mode: "absolute-height" },
      });
      el.map.add(layer);
      void addScene(el, layer).catch(() => setStatus("failed"));
    }
  };

  const waveNote = rippled
    ? "The water is set to rippled here — the mirror is smeared, but SSR's on/off behaviour is unchanged."
    : "The water is glass-calm, so the reflection is a crisp mirror.";

  const caption =
    status === "failed"
      ? "The scene failed to build — reload the page to retry."
      : status === "loading"
        ? "Building the waterfront…"
        : preset === "in-frame"
          ? `Everything the water mirrors is computed from the pixels already on screen — cheap, sharp, convincing. ${waveNote}`
          : `The tower just left the frame — and its reflection died with it. Screen-space reflections can't reflect what isn't rendered: THE tell-tale artifact, in games and here. ${waveNote}`;

  return (
    <PlaygroundFrame
      title="Screen-space reflections: no pixel, no mirror"
      caption={caption}
      onReset={() => {
        setPreset(INITIAL.preset);
        setRippled(INITIAL.rippled);
        applyWaves(INITIAL.rippled);
        const el = readyScene();
        if (el) goToPreset(el, INITIAL.preset);
      }}
      controls={
        <>
          <SegmentedControl<Preset>
            label="Camera"
            value={preset}
            options={[
              { value: "in-frame", label: "Tower in frame" },
              { value: "leaving", label: "Tower leaving frame" },
            ]}
            onChange={(p) => {
              setPreset(p);
              const el = readyScene();
              if (el) goToPreset(el, p);
            }}
          />
          <SwitchControl
            label="Rippled water"
            checked={rippled}
            onChange={(r) => {
              setRippled(r);
              applyWaves(r);
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            SSR reuses the frame it just rendered as its mirror source, so anything off-screen or
            occluded has no pixel to reflect — engines paper over the gaps with skyboxes and
            reflection probes. The r3f SSR demo above shows the same failure on a sphere. Switch to
            "Tower leaving frame" and watch the reflection truncate as the tower slides off the top
            edge. These water reflections only appear at the scene's high quality profile, which
            this demo forces on.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="osm"
        ground="world-elevation"
        qualityProfile="high"
        cameraPosition={INIT_CAMERA}
        cameraHeading={PRESETS["in-frame"].heading}
        cameraTilt={PRESETS["in-frame"].tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
    </PlaygroundFrame>
  );
}
