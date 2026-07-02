import { useRef, useState } from "react";
import Camera from "@arcgis/core/Camera.js";
import SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import "@arcgis/map-components/components/arcgis-scene";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl, SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Direct vs. indirect light, at city scale. The sun is the one direct source:
 * it hits the facades it can see and leaves the rest in shadow. Yet the shadowed
 * side of a street is never black — you can still read every window. That fill
 * is *indirect* light: in the real world, photons bounce off the bright wall
 * onto the dark one. This engine doesn't trace those bounces; it approximates
 * them with a constant ambient term (plus adaptive occlusion), the same honest
 * shortcut the SSAO demo makes. The Cornell-box demo above shows what real
 * bounced light looks like — colour bleeding the ambient constant can't produce.
 *
 * Keyless services only (verified): OSM basemap, Esri world elevation, and the
 * public OpenStreetMap 3D buildings scene service — same as the Shadows demo.
 */

const OSM_BUILDINGS_URL =
  "https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer";
const OSM_BUILDINGS_ID = "osm-3d-buildings";

type CameraPreset = "canyon" | "overview";

const CAMERAS: Record<
  CameraPreset,
  { position: [number, number, number]; heading: number; tilt: number }
> = {
  // Down inside a street of the Zurich old town, looking along it: one row of
  // facades takes the sun, the row opposite lives entirely on ambient fill.
  canyon: { position: [8.5423, 47.3705, 415], heading: 25, tilt: 88 },
  // Higher and tilted, so the lit and shadowed sides of many streets read at once.
  overview: { position: [8.5417, 47.369, 720], heading: 15, tilt: 62 },
};

/** Local Zurich hour (UTC+2 in June) → Date for the sun position. */
const dateForHour = (hour: number): Date =>
  new Date(Date.UTC(2026, 5, 21, 0, Math.round(hour * 60) - 120));

const formatHour = (hour: number): string => {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const INITIAL = { hour: 8, directShadows: true, preset: "canyon" as CameraPreset };

export default function SunAmbient(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const [hour, setHour] = useState(INITIAL.hour);
  const [directShadows, setDirectShadows] = useState(INITIAL.directShadows);
  const [preset, setPreset] = useState<CameraPreset>(INITIAL.preset);

  /** True once the view exists; all imperative access goes through this. */
  const readyScene = (): HTMLArcgisSceneElement | null => {
    const el = sceneRef.current;
    return el && el.view ? el : null;
  };

  /** Reassign a whole lighting object (SunLighting) so ArcGIS applies it cleanly. */
  const applyLighting = (el: HTMLArcgisSceneElement, h: number, shadows: boolean): void => {
    el.environment.lighting = {
      type: "sun",
      date: dateForHour(h),
      directShadowsEnabled: shadows,
    };
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
    applyLighting(el, hour, directShadows);
  };

  const caption = directShadows
    ? `Sun at ${formatHour(hour)}, direct shadows ON. At this raking angle one side of the street gets the sun's direct light head-on; the facades opposite get none — yet you can still read every window. That is the engine's ambient term standing in for bounced light. Real global illumination would throw the bright wall's colour onto the dark one; this approximation just adds a flat constant everywhere.`
    : `Sun at ${formatHour(hour)}, direct shadows OFF. With the one direct source's occlusion removed, the whole scene is lit by the ambient fill alone — flat and shadowless, every surface the same. This is the indirect approximation on its own, and it's exactly why direct light is what gives a scene its shape.`;

  return (
    <PlaygroundFrame
      title="Direct sun vs. ambient fill over Zurich"
      caption={caption}
      onReset={() => {
        setHour(INITIAL.hour);
        setDirectShadows(INITIAL.directShadows);
        setPreset(INITIAL.preset);
        const el = readyScene();
        if (!el) return;
        applyLighting(el, INITIAL.hour, INITIAL.directShadows);
        goToPreset(el, INITIAL.preset);
      }}
      controls={
        <>
          <SwitchControl
            label="Direct shadows"
            checked={directShadows}
            onChange={(on) => {
              setDirectShadows(on);
              const el = readyScene();
              if (el) applyLighting(el, hour, on);
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
              if (el) applyLighting(el, h, directShadows);
            }}
          />
          <SegmentedControl<CameraPreset>
            label="Camera"
            value={preset}
            options={[
              { value: "canyon", label: "Street canyon" },
              { value: "overview", label: "Overview" },
            ]}
            onChange={(p) => {
              setPreset(p);
              const el = readyScene();
              if (el) goToPreset(el, p);
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Direct light arrives straight from the source; indirect light arrives after bouncing off
            other surfaces. Realtime engines approximate the indirect part (ambient, light probes,
            SSAO) because tracing real bounces is expensive — the Cornell-box demo above shows the
            colour bleeding that only true bounced light produces. Push the sun toward morning or
            evening to make the split between the two most obvious.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="osm"
        ground="world-elevation"
        cameraPosition="8.5423, 47.3705, 415"
        cameraHeading={CAMERAS.canyon.heading}
        cameraTilt={CAMERAS.canyon.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
    </PlaygroundFrame>
  );
}
