import { useRef, useState } from "react";
import Camera from "@arcgis/core/Camera.js";
import SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import "@arcgis/map-components/components/arcgis-scene";
import "@esri/calcite-components/components/calcite-notice";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Screen-space ambient occlusion in Zurich's old town — with an honest twist:
 * `environment.ambientOcclusionEnabled` was REMOVED in ArcGIS Maps SDK v5
 * (verified: zero "ambientOcclusion" hits anywhere in the installed
 * @arcgis/core v5 .d.ts files). SSAO is now applied automatically as part of
 * adaptive rendering, with no runtime switch. A fake toggle would lie, so
 * instead this demo isolates AO the other way around: turn the sun's direct
 * shadows OFF and whatever darkening remains where walls meet streets and
 * inside courtyards is the automatic SSAO doing its job.
 *
 * Keyless services only: OSM basemap, world elevation, OSM 3D buildings.
 */

const OSM_BUILDINGS_URL =
  "https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer";
const OSM_BUILDINGS_ID = "osm-3d-buildings";

/** Late-morning summer sun — crisp light, so toggling its shadows is obvious. */
const INITIAL_DATE = new Date("2026-06-21T10:00:00Z");

type CameraPreset = "courtyard" | "overview";

const CAMERAS: Record<
  CameraPreset,
  { position: [number, number, number]; heading: number; tilt: number }
> = {
  // Just above the Niederdorf rooftops, looking along the narrow lanes —
  // street canyons and courtyards are where SSAO darkening is easiest to see.
  courtyard: { position: [8.5447, 47.3705, 520], heading: 350, tilt: 78 },
  // Higher overview of the old town for context.
  overview: { position: [8.5417, 47.366, 950], heading: 5, tilt: 60 },
};

const INITIAL = { castShadows: true, atmosphere: true, preset: "courtyard" as CameraPreset };

export default function Ssao(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const [castShadows, setCastShadows] = useState(INITIAL.castShadows);
  const [atmosphere, setAtmosphere] = useState(INITIAL.atmosphere);
  const [preset, setPreset] = useState<CameraPreset>(INITIAL.preset);

  /** True once the view exists; all imperative access goes through this. */
  const readyScene = (): HTMLArcgisSceneElement | null => {
    const el = sceneRef.current;
    return el && el.view ? el : null;
  };

  const applyShadows = (el: HTMLArcgisSceneElement, on: boolean): void => {
    const lighting = el.environment.lighting;
    if (lighting.type === "sun") lighting.directShadowsEnabled = on;
  };

  const goToPreset = (el: HTMLArcgisSceneElement, p: CameraPreset): void => {
    const { position, heading, tilt } = CAMERAS[p];
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
    el.environment.lighting = {
      type: "sun",
      date: INITIAL_DATE,
      directShadowsEnabled: castShadows,
    };
    el.environment.atmosphereEnabled = atmosphere;
  };

  const caption = castShadows
    ? "Direct sun shadows are on, so they dominate. Look where they don't reach: the soft contact darkening at the base of every facade, in alley corners and inner courtyards, is screen-space ambient occlusion — this engine applies it automatically from the depth buffer."
    : "Sun shadows are OFF, yet the city does not float: SSAO still darkens creases where geometry blocks ambient sky light — wall/street junctions, courtyards, gaps between roofs. That residual grounding is exactly what ambient occlusion contributes.";

  return (
    <PlaygroundFrame
      title="Ambient occlusion in Zurich's old town"
      caption={caption}
      onReset={() => {
        setCastShadows(INITIAL.castShadows);
        setAtmosphere(INITIAL.atmosphere);
        setPreset(INITIAL.preset);
        const el = readyScene();
        if (!el) return;
        el.environment.lighting = {
          type: "sun",
          date: INITIAL_DATE,
          directShadowsEnabled: INITIAL.castShadows,
        };
        el.environment.atmosphereEnabled = INITIAL.atmosphere;
        goToPreset(el, INITIAL.preset);
      }}
      controls={
        <>
          <calcite-notice open icon="information" kind="info" scale="s" width="full">
            <div slot="message">
              This engine has no SSAO switch: the old ambientOcclusionEnabled flag was removed in v5
              and occlusion is applied automatically. SSAO estimates, per pixel, how much nearby
              geometry blocks ambient light — look for contact darkening where buildings meet the
              ground, in courtyards, and under bridges.
            </div>
          </calcite-notice>
          <SwitchControl
            label="Direct sun shadows"
            checked={castShadows}
            onChange={(on) => {
              setCastShadows(on);
              const el = readyScene();
              if (el) applyShadows(el, on);
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
              { value: "courtyard", label: "Courtyards" },
              { value: "overview", label: "Overview" },
            ]}
            onChange={(p) => {
              setPreset(p);
              const el = readyScene();
              if (el) goToPreset(el, p);
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Best experiment: switch sun shadows off in the courtyard view — every bit of darkening
            that survives is ambient occlusion, not shadow mapping.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="osm"
        ground="world-elevation"
        cameraPosition="8.5447, 47.3705, 520"
        cameraHeading={CAMERAS.courtyard.heading}
        cameraTilt={CAMERAS.courtyard.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
    </PlaygroundFrame>
  );
}
