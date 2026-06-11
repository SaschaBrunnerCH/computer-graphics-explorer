import { useRef, useState } from "react";
import Camera from "@arcgis/core/Camera.js";
import SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import "@arcgis/map-components/components/arcgis-scene";
import "@arcgis/map-components/components/arcgis-daylight";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Real shadow mapping at city scale: an ArcGIS scene of Zurich where the sun
 * renders the city into a depth texture and every pixel tests itself against
 * it. The daylight component moves the sun; toggling shadows off shows the
 * "floaty" look shadow mapping exists to fix.
 *
 * Keyless services only (verified): OSM basemap, Esri world elevation, and the
 * public OpenStreetMap 3D buildings scene service.
 */

const OSM_BUILDINGS_URL =
  "https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer";
const OSM_BUILDINGS_ID = "osm-3d-buildings";

/** Late-June, late-afternoon sun over Zurich (UTC+2) → long, obvious shadows. */
const INITIAL_DATE = new Date("2026-06-21T15:30:00Z");

type CameraPreset = "overview" | "street";

const CAMERAS: Record<CameraPreset, { position: [number, number, number]; heading: number; tilt: number }> = {
  // Above the old town, tilted so building shadows stretch across the streets.
  overview: { position: [8.5417, 47.369, 760], heading: 10, tilt: 65 },
  // Just above the rooftops along the Limmat — shadow edges up close.
  street: { position: [8.5405, 47.3736, 480], heading: 35, tilt: 78 },
};

const INITIAL = { castShadows: true, atmosphere: true, preset: "overview" as CameraPreset };

export default function Shadows(): React.JSX.Element {
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
    // StrictMode double-mounts and basemap changes can re-fire this; add once.
    if (el.map && !el.map.findLayerById(OSM_BUILDINGS_ID)) {
      el.map.add(
        new SceneLayer({ id: OSM_BUILDINGS_ID, url: OSM_BUILDINGS_URL, title: "OSM 3D Buildings" }),
      );
    }
    // Sun lighting with a fixed late-afternoon date so shadows are long and
    // obvious from the first frame; the daylight component drives it from here.
    el.environment.lighting = {
      type: "sun",
      date: INITIAL_DATE,
      directShadowsEnabled: castShadows,
    };
    el.environment.atmosphereEnabled = atmosphere;
  };

  const caption = castShadows
    ? "The sun renders the city into a depth texture (the shadow map); every pixel compares its distance to it. A small depth bias hides stripey shadow acne — too much and shadows detach from their buildings (peter-panning). Scrub the daylight slider to move the sun."
    : "Direct shadows are off: buildings look pasted-on and 'floaty', with nothing anchoring them to the ground. That missing contact cue is exactly what shadow mapping restores.";

  return (
    <PlaygroundFrame
      title="Sun-driven shadows over Zurich"
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
          <SwitchControl
            label="Cast shadows"
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
              { value: "overview", label: "Overview" },
              { value: "street", label: "Street level" },
            ]}
            onChange={(p) => {
              setPreset(p);
              const el = readyScene();
              if (el) goToPreset(el, p);
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Use the daylight panel on the map to scrub time of day and date — shadows track the
            real sun position. Ambient occlusion is automatic in this engine (adaptive rendering).
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="osm"
        ground="world-elevation"
        cameraPosition="8.5417, 47.3690, 760"
        cameraHeading={CAMERAS.overview.heading}
        cameraTilt={CAMERAS.overview.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      >
        <arcgis-daylight
          slot="top-right"
          hideHeader
          hideTimezone
          hideShadowsToggle
          hideSunLightingToggle
        />
      </arcgis-scene>
    </PlaygroundFrame>
  );
}
