import { useRef, useState } from "react";
import "@arcgis/map-components/components/arcgis-scene";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl, SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Atmosphere and fog as depth cues over the Bernese Alps: the camera looks
 * down the Lauterbrunnen valley toward the Jungfrau massif, so ridgelines
 * recede plane by plane — exactly the situation aerial perspective and
 * distance fog were invented to depict.
 *
 * The runtime weather API (verified in @arcgis/core v5 typings,
 * webscene/Environment.d.ts): view.environment.weather is a settable union
 * autocast — { type: "sunny" | "cloudy", cloudCover } and
 * { type: "foggy", fogStrength } — and environment.atmosphereEnabled turns
 * the whole sky/scattering/weather pipeline off (disabling atmosphere also
 * disables weather, per the docs).
 *
 * Note: there is also an `<arcgis-weather>` map component, but it is a full
 * widget panel with its own UI; we drive environment.weather imperatively so
 * the controls match the rest of the exhibit.
 *
 * Keyless services only: OSM basemap + Esri world elevation.
 */

type Weather = "sunny" | "cloudy" | "foggy";

/**
 * Mouth of the Lauterbrunnen valley, looking south: valley walls close by,
 * the Breithorn/Jungfrau massif stacked behind — layered depth for fog.
 */
const CAMERA = { position: "7.9080, 46.6300, 3200", heading: 172, tilt: 78 };

const INITIAL = {
  atmosphere: true,
  weather: "sunny" as Weather,
  cloudCover: 0.3,
  // Kept gentle by default: at this camera distance 0.5+ whites out the
  // whole valley — instructive for a second, but a poor first impression.
  fogStrength: 0.25,
};

export default function AtmosphereFog(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const [atmosphere, setAtmosphere] = useState(INITIAL.atmosphere);
  const [weather, setWeather] = useState<Weather>(INITIAL.weather);
  const [cloudCover, setCloudCover] = useState(INITIAL.cloudCover);
  const [fogStrength, setFogStrength] = useState(INITIAL.fogStrength);

  /** True once the view exists; all imperative access goes through this. */
  const readyScene = (): HTMLArcgisSceneElement | null => {
    const el = sceneRef.current;
    return el && el.view ? el : null;
  };

  const applyWeather = (
    el: HTMLArcgisSceneElement,
    kind: Weather,
    clouds: number,
    fog: number,
  ): void => {
    el.environment.weather =
      kind === "foggy"
        ? { type: "foggy", fogStrength: fog }
        : kind === "cloudy"
          ? { type: "cloudy", cloudCover: clouds }
          : { type: "sunny", cloudCover: clouds };
  };

  const handleViewReady = (event: { target: HTMLArcgisSceneElement }): void => {
    const el = event.target;
    // StrictMode double-mounts can re-fire this; setting state is idempotent.
    el.environment.atmosphereEnabled = atmosphere;
    applyWeather(el, weather, cloudCover, fogStrength);
  };

  const caption = !atmosphere
    ? "Atmosphere off: the sky goes black and all scattering disappears — distant ridges render just as crisp as near ones, so the depth ordering collapses. Weather (clouds and fog) is part of the atmosphere pipeline, so it is disabled too."
    : weather === "foggy"
      ? `Fog strength ${fogStrength.toFixed(2)}: light is attenuated exponentially with distance, so each ridgeline fades toward the sky color. That fade is a powerful depth cue — your eye reads "more faded" as "farther away" (aerial perspective, exaggerated).`
      : `Clear air still scatters light: the farther a ridge, the more haze accumulates along the view ray, shifting it lighter and bluer — that is aerial perspective. Cloud cover ${cloudCover.toFixed(2)}. Switch the weather to foggy to exaggerate the effect.`;

  return (
    <PlaygroundFrame
      title="Atmosphere & fog over the Lauterbrunnen valley"
      caption={caption}
      onReset={() => {
        setAtmosphere(INITIAL.atmosphere);
        setWeather(INITIAL.weather);
        setCloudCover(INITIAL.cloudCover);
        setFogStrength(INITIAL.fogStrength);
        const el = readyScene();
        if (!el) return;
        el.environment.atmosphereEnabled = INITIAL.atmosphere;
        applyWeather(el, INITIAL.weather, INITIAL.cloudCover, INITIAL.fogStrength);
      }}
      controls={
        <>
          <SwitchControl
            label="Atmosphere"
            checked={atmosphere}
            onChange={(on) => {
              setAtmosphere(on);
              const el = readyScene();
              if (el) el.environment.atmosphereEnabled = on;
            }}
          />
          <SegmentedControl<Weather>
            label="Weather"
            value={weather}
            options={[
              { value: "sunny", label: "Sunny" },
              { value: "cloudy", label: "Cloudy" },
              { value: "foggy", label: "Foggy" },
            ]}
            onChange={(w) => {
              setWeather(w);
              const el = readyScene();
              if (el) applyWeather(el, w, cloudCover, fogStrength);
            }}
          />
          {weather === "foggy" ? (
            <SliderControl
              label="Fog strength"
              value={fogStrength}
              min={0}
              max={1}
              step={0.05}
              format={(v) => v.toFixed(2)}
              onInput={(v) => {
                setFogStrength(v);
                const el = readyScene();
                if (el) applyWeather(el, "foggy", cloudCover, v);
              }}
            />
          ) : (
            <SliderControl
              label="Cloud cover"
              value={cloudCover}
              min={0}
              max={1}
              step={0.05}
              format={(v) => v.toFixed(2)}
              onInput={(v) => {
                setCloudCover(v);
                const el = readyScene();
                if (el) applyWeather(el, weather, v, fogStrength);
              }}
            />
          )}
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Weather only renders while the atmosphere is on. Drag the view to sweep the camera
            across the ridgelines and watch how distance changes their contrast.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="osm"
        ground="world-elevation"
        cameraPosition={CAMERA.position}
        cameraHeading={CAMERA.heading}
        cameraTilt={CAMERA.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
    </PlaygroundFrame>
  );
}
