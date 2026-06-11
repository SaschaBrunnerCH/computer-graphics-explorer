import { useRef, useState } from "react";
import Camera from "@arcgis/core/Camera.js";
import SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import "@arcgis/map-components/components/arcgis-scene";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Level of detail over Innsbruck: terrain tiles and OSM buildings both stream
 * in discrete detail levels, and the engine picks the level whose geometric
 * error projects below a screen-space threshold. Flying the camera between
 * altitude presets makes the swaps visible; the caption shows a live
 * altitude/zoom readout taken from the arcgisViewChange event.
 *
 * Honest-control notes (verified in @arcgis/core v5 typings):
 * - SceneView.qualityProfile is a settable accessor ("low" | "medium" |
 *   "high"); the docs explicitly suggest exposing it to users, and it scales
 *   the memory budget + level of detail — a real runtime LOD lever, so we
 *   ship it as a control.
 * - LayerView.suspended is a read-only getter, so a "suspend streaming"
 *   toggle is NOT possible; it was dropped rather than faked.
 *
 * Keyless services only: OSM basemap, world elevation, OSM 3D buildings.
 */

const OSM_BUILDINGS_URL =
  "https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer";
const OSM_BUILDINGS_ID = "osm-3d-buildings";

type Altitude = "far" | "mid" | "near";
type Quality = "low" | "medium" | "high";

const CAMERAS: Record<
  Altitude,
  { position: [number, number, number]; heading: number; tilt: number }
> = {
  // The whole Inn valley: coarse terrain tiles, buildings barely loaded.
  far: { position: [11.4, 46.9, 50000], heading: 0, tilt: 35 },
  // City scale: finer terrain, blocky building shells appear.
  mid: { position: [11.4, 47.2, 5000], heading: 350, tilt: 60 },
  // Old town rooftops: the finest tiles and full building detail stream in.
  near: { position: [11.397, 47.262, 800], heading: 335, tilt: 75 },
};

const INITIAL = { altitude: "far" as Altitude, quality: "medium" as Quality };

export default function Lod(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const [altitude, setAltitude] = useState<Altitude>(INITIAL.altitude);
  const [quality, setQuality] = useState<Quality>(INITIAL.quality);
  // Live camera readout, rounded so animation frames don't thrash renders.
  const [readout, setReadout] = useState<{ alt: number; zoom: number } | null>(null);

  /** True once the view exists; all imperative access goes through this. */
  const readyScene = (): HTMLArcgisSceneElement | null => {
    const el = sceneRef.current;
    return el && el.view ? el : null;
  };

  const goToPreset = (el: HTMLArcgisSceneElement, a: Altitude): void => {
    const { position, heading, tilt } = CAMERAS[a];
    const [longitude, latitude, z] = position;
    void el
      .goTo(new Camera({ position: { longitude, latitude, z }, heading, tilt }))
      .catch(() => undefined); // interrupted animations reject — never crash on that
  };

  const handleViewReady = (event: { target: HTMLArcgisSceneElement }): void => {
    const el = event.target;
    // StrictMode double-mounts can re-fire this; add the layer only once.
    if (el.map && !el.map.findLayerById(OSM_BUILDINGS_ID)) {
      el.map.add(
        new SceneLayer({ id: OSM_BUILDINGS_ID, url: OSM_BUILDINGS_URL, title: "OSM 3D Buildings" }),
      );
    }
    el.qualityProfile = quality;
  };

  const handleViewChange = (event: { target: HTMLArcgisSceneElement }): void => {
    const view = event.target.view;
    const z = view?.camera?.position.z;
    if (view == null || z == null) return;
    const alt = Math.round(z / 10) * 10;
    const zoom = Number.isFinite(view.zoom) && view.zoom >= 0 ? Math.round(view.zoom * 10) / 10 : 0;
    setReadout((prev) => (prev && prev.alt === alt && prev.zoom === zoom ? prev : { alt, zoom }));
  };

  const liveStats = readout
    ? `Camera altitude ≈ ${readout.alt.toLocaleString("en-US")} m · zoom level ≈ ${readout.zoom}.`
    : "Waiting for the first frame…";

  const caption = `${liveStats} The engine refines each terrain tile and building node until its geometric error projects below a pixel threshold on screen (screen-space error) — fly closer and watch finer tiles replace coarse ones; the ${quality} quality profile scales how much detail it may keep in memory.`;

  return (
    <PlaygroundFrame
      title="Level of detail streaming over Innsbruck"
      caption={caption}
      onReset={() => {
        setAltitude(INITIAL.altitude);
        setQuality(INITIAL.quality);
        const el = readyScene();
        if (!el) return;
        el.qualityProfile = INITIAL.quality;
        goToPreset(el, INITIAL.altitude);
      }}
      controls={
        <>
          <SegmentedControl<Altitude>
            label="Altitude"
            value={altitude}
            options={[
              { value: "far", label: "Far" },
              { value: "mid", label: "Mid" },
              { value: "near", label: "Near" },
            ]}
            onChange={(a) => {
              setAltitude(a);
              const el = readyScene();
              if (el) goToPreset(el, a);
            }}
          />
          <SegmentedControl<Quality>
            label="Quality profile"
            value={quality}
            options={[
              { value: "low", label: "Low" },
              { value: "medium", label: "Med" },
              { value: "high", label: "High" },
            ]}
            onChange={(q) => {
              setQuality(q);
              const el = readyScene();
              if (el) el.qualityProfile = q;
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Watch the buildings during the Far → Near flight: they pop in as flat-shaded shells
            first, then refine. Lower the quality profile to make the engine settle for coarser
            levels at the same distance.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="osm"
        ground="world-elevation"
        cameraPosition="11.4000, 46.9000, 50000"
        cameraHeading={CAMERAS.far.heading}
        cameraTilt={CAMERAS.far.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
        onarcgisViewChange={handleViewChange}
      />
    </PlaygroundFrame>
  );
}
