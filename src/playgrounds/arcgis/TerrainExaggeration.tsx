import { useRef, useState } from "react";
import Camera from "@arcgis/core/Camera.js";
import BaseElevationLayer from "@arcgis/core/layers/BaseElevationLayer.js";
import ElevationLayer from "@arcgis/core/layers/ElevationLayer.js";
import "@arcgis/map-components/components/arcgis-scene";
import type { FetchTileOptions } from "@arcgis/core/layers/BaseElevationLayer.js";
import type { ElevationTileData } from "@arcgis/core/layers/support/types.js";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl, SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Terrain exaggeration around the Matterhorn: planet-scale displacement
 * mapping with the displacement amount on a slider.
 *
 * v5 mechanism (verified in @arcgis/core typings): `Ground` has NO
 * exaggeration property, so we use the documented Esri pattern — a custom
 * elevation layer made with `BaseElevationLayer.createSubclass()` that wraps
 * the world elevation service and multiplies every fetched height sample
 * (`fetchTile` must resolve to ElevationTileData; `values` is a readonly
 * ArrayLike, so we return a new scaled Float32Array instead of mutating).
 * Changing exaggeration rebuilds the ground layer (debounced) — the terrain
 * tiles are re-fetched and re-displaced.
 *
 * Keyless services (curl-verified token-free): World Imagery basemap
 * (`satellite`) and the WorldElevation3D/Terrain3D image service.
 */

const WORLD_ELEVATION_URL =
  "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";
const GROUND_LAYER_ID = "exaggerated-world-elevation";
const MATTERHORN_SUMMIT_M = 4478;

interface ExaggeratedElevation extends BaseElevationLayer {
  exaggeration: number;
  _source: ElevationLayer;
}

/** Documented v5 pattern: Accessor.createSubclass on BaseElevationLayer. */
const ExaggeratedElevationLayer = BaseElevationLayer.createSubclass({
  properties: { exaggeration: 1 },
  load(this: ExaggeratedElevation): void {
    this._source = new ElevationLayer({ url: WORLD_ELEVATION_URL });
    this.addResolvingPromise(this._source.load());
  },
  async fetchTile(
    this: ExaggeratedElevation,
    level: number,
    row: number,
    column: number,
    options?: FetchTileOptions,
  ): Promise<ElevationTileData> {
    const tile = await this._source.fetchTile(level, row, column, options);
    const factor = this.exaggeration;
    // Keep no-data samples unchanged (per the BaseElevationLayer docs).
    const values = Float32Array.from(tile.values, (v) => (v === tile.noDataValue ? v : v * factor));
    return { values, width: tile.width, height: tile.height, noDataValue: tile.noDataValue };
  },
}) as unknown as new (props?: { exaggeration?: number; id?: string }) => ExaggeratedElevation;

type CameraPreset = "peak" | "valley";

/**
 * Camera altitude is computed as groundZ × exaggeration + above, so each
 * preset keeps roughly the same height over the (displaced) terrain at every
 * exaggeration value — honest arithmetic instead of hand-tuned magic numbers.
 */
const CAMERAS: Record<
  CameraPreset,
  { lon: number; lat: number; groundZ: number; above: number; heading: number; tilt: number }
> = {
  // On the glacier plateau east of the Matterhorn, looking west at the peak.
  peak: { lon: 7.72, lat: 45.98, groundZ: 3100, above: 1800, heading: 265, tilt: 75 },
  // Above the Zermatt valley floor, looking southwest up at the massif.
  valley: { lon: 7.756, lat: 46.033, groundZ: 1600, above: 900, heading: 235, tilt: 80 },
};

const INITIAL = { exaggeration: 2, atmosphere: true, preset: "peak" as CameraPreset };

const cameraZ = (p: CameraPreset, exaggeration: number): number =>
  CAMERAS[p].groundZ * exaggeration + CAMERAS[p].above;

export default function TerrainExaggeration(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  const [exaggeration, setExaggeration] = useState(INITIAL.exaggeration);
  const [atmosphere, setAtmosphere] = useState(INITIAL.atmosphere);
  const [preset, setPreset] = useState<CameraPreset>(INITIAL.preset);

  /** True once the view exists; all imperative access goes through this. */
  const readyScene = (): HTMLArcgisSceneElement | null => {
    const el = sceneRef.current;
    return el && el.view ? el : null;
  };

  /** Replace the ground's elevation layer with one at the given factor. */
  const rebuildGround = (el: HTMLArcgisSceneElement, factor: number): void => {
    if (!el.map) return;
    const layers = el.map.ground.layers;
    layers.removeAll();
    layers.add(new ExaggeratedElevationLayer({ exaggeration: factor, id: GROUND_LAYER_ID }));
  };

  const goToPreset = (el: HTMLArcgisSceneElement, p: CameraPreset, factor: number): void => {
    const { lon, lat, heading, tilt } = CAMERAS[p];
    void el
      .goTo(
        new Camera({
          position: { longitude: lon, latitude: lat, z: cameraZ(p, factor) },
          heading,
          tilt,
        }),
      )
      .catch(() => undefined); // interrupted animations reject — never crash on that
  };

  const handleViewReady = (event: { target: HTMLArcgisSceneElement }): void => {
    const el = event.target;
    // StrictMode double-mounts can re-fire this; add the ground layer once.
    if (el.map && !el.map.ground.layers.find((l) => l.id === GROUND_LAYER_ID)) {
      rebuildGround(el, exaggeration);
    }
    el.environment.atmosphereEnabled = atmosphere;
  };

  const summit = Math.round((MATTERHORN_SUMMIT_M * exaggeration) / 10) * 10;
  const caption = `Exaggeration ×${exaggeration.toFixed(1)}: terrain rendering is displacement mapping at planet scale — each elevation tile is a heightmap displacing a regular grid mesh, and the custom elevation layer multiplies every height sample by ${exaggeration.toFixed(1)} before the vertices are displaced. The 4,478 m Matterhorn reads ≈ ${summit.toLocaleString("en-US")} m${exaggeration === 1 ? " (true height)" : ""}.`;

  return (
    <PlaygroundFrame
      title="Terrain exaggeration around the Matterhorn"
      caption={caption}
      onReset={() => {
        window.clearTimeout(debounceRef.current);
        setExaggeration(INITIAL.exaggeration);
        setAtmosphere(INITIAL.atmosphere);
        setPreset(INITIAL.preset);
        const el = readyScene();
        if (!el) return;
        rebuildGround(el, INITIAL.exaggeration);
        el.environment.atmosphereEnabled = INITIAL.atmosphere;
        goToPreset(el, INITIAL.preset, INITIAL.exaggeration);
      }}
      controls={
        <>
          <SliderControl
            label="Exaggeration"
            value={exaggeration}
            min={1}
            max={3}
            step={0.1}
            format={(v) => `×${v.toFixed(1)}`}
            onInput={(v) => {
              setExaggeration(v);
              // Rebuilding the ground re-fetches every visible tile, so
              // debounce while the slider is dragging.
              window.clearTimeout(debounceRef.current);
              debounceRef.current = window.setTimeout(() => {
                const el = readyScene();
                if (el) rebuildGround(el, v);
              }, 300);
            }}
          />
          <SwitchControl
            label="Atmosphere"
            checked={atmosphere}
            onChange={(on) => {
              setAtmosphere(on);
              const el = readyScene();
              if (el) el.environment.atmosphereEnabled = on;
            }}
          />
          <SegmentedControl<CameraPreset>
            label="Camera"
            value={preset}
            options={[
              { value: "peak", label: "Peak" },
              { value: "valley", label: "Valley" },
            ]}
            onChange={(p) => {
              setPreset(p);
              const el = readyScene();
              if (el) goToPreset(el, p, exaggeration);
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            The ground has no exaggeration knob in this engine — the slider swaps in a custom
            elevation layer that wraps the world elevation service and scales every fetched height
            tile, so the terrain re-displaces when you release it.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="satellite"
        cameraPosition={`${CAMERAS.peak.lon}, ${CAMERAS.peak.lat}, ${cameraZ("peak", INITIAL.exaggeration)}`}
        cameraHeading={CAMERAS.peak.heading}
        cameraTilt={CAMERAS.peak.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
    </PlaygroundFrame>
  );
}
