import { useRef, useState } from "react";
import "@arcgis/map-components/components/arcgis-map";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Real moiré on real farmland: the World Imagery basemap over southwest
 * Kansas, where center-pivot irrigation lays out a near-regular grid of
 * equal circles. Resampling that grid onto the screen's pixel grid makes the
 * two frequencies beat — interference bands that appear, swim, and dissolve
 * as scale and angle change, exactly like the checkerboard demo.
 *
 * Keyless service (curl-verified): the "satellite" basemap is backed by the
 * public World_Imagery MapServer on services.arcgisonline.com.
 */

/** Dense block of center-pivot circles between Ulysses and Sublette, KS. */
const CENTER: [number, number] = [-100.9, 37.65];
const CENTER_ATTR = `${CENTER[0]}, ${CENTER[1]}`;

const ZOOM = { min: 10, max: 15, step: 0.05 };
const ROTATION = { min: 0, max: 90, step: 1 };
const INITIAL = { zoom: 11.5, rotation: 0 };

export default function MapMoire(): React.JSX.Element {
  const mapRef = useRef<HTMLArcgisMapElement | null>(null);
  const lastUpdateRef = useRef(0);
  const trailingRef = useRef<number | undefined>(undefined);
  const [zoom, setZoom] = useState(INITIAL.zoom);
  const [rotation, setRotation] = useState(INITIAL.rotation);

  /** True once the view exists; all imperative access goes through this. */
  const readyMap = (): HTMLArcgisMapElement | null => {
    const el = mapRef.current;
    return el && el.view ? el : null;
  };

  /** Mirror the live view state into the sliders/caption (deduped). */
  const updateReadout = (): void => {
    const el = readyMap();
    if (!el) return;
    const z = Math.round(el.zoom * 100) / 100;
    const r = Math.round(el.rotation);
    setZoom((prev) => (prev === z ? prev : z));
    setRotation((prev) => (prev === r ? prev : r));
  };

  const handleViewChange = (): void => {
    // Throttle: fires every animation frame while navigating. The trailing
    // timeout guarantees the final value lands after the burst ends.
    const now = performance.now();
    window.clearTimeout(trailingRef.current);
    if (now - lastUpdateRef.current >= 200) {
      lastUpdateRef.current = now;
      updateReadout();
    } else {
      trailingRef.current = window.setTimeout(() => {
        lastUpdateRef.current = performance.now();
        updateReadout();
      }, 220);
    }
  };

  const caption = `Zoom ${zoom.toFixed(2)}, rotation ${rotation}° — center-pivot irrigation draws a near-regular grid of equal circles on the ground. The imagery is resampled onto the screen's regular pixel grid, and when the two spatial frequencies come close they beat: real moiré bands drift across the fields. Scale changes one grid's frequency, rotation changes their relative angle — the same two knobs as the checkerboard above.`;

  return (
    <PlaygroundFrame
      title="Moiré over Kansas pivot-irrigation fields"
      caption={caption}
      onReset={() => {
        setZoom(INITIAL.zoom);
        setRotation(INITIAL.rotation);
        const el = readyMap();
        if (!el) return;
        el.rotation = INITIAL.rotation;
        void el
          .goTo({ center: [...CENTER], zoom: INITIAL.zoom }, { animate: false })
          .catch(() => undefined); // interrupted navigations reject — never crash on that
      }}
      controls={
        <>
          <SliderControl
            label="Zoom"
            value={zoom}
            min={ZOOM.min}
            max={ZOOM.max}
            step={ZOOM.step}
            onInput={(v) => {
              setZoom(v);
              const el = readyMap();
              if (el) el.zoom = v;
            }}
            format={(v) => v.toFixed(2)}
          />
          <SliderControl
            label="Rotation"
            value={rotation}
            min={ROTATION.min}
            max={ROTATION.max}
            step={ROTATION.step}
            onInput={(v) => {
              setRotation(v);
              const el = readyMap();
              if (el) el.rotation = v;
            }}
            format={(v) => `${v.toFixed(0)}°`}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Hunt slowly: sweep zoom in 0.05 steps until faint bands appear over the circle grid,
            then rotate — the bands swing and change spacing because the interference depends on the
            angle between the field grid and the pixel grid.
          </p>
        </>
      }
    >
      <arcgis-map
        ref={mapRef}
        className="block h-full w-full"
        basemap="satellite"
        center={CENTER_ATTR}
        zoom={INITIAL.zoom}
        rotation={INITIAL.rotation}
        popupDisabled
        onarcgisViewReadyChange={(event: { target: HTMLArcgisMapElement }) => {
          // Continuous zoom so the view can park on the fractional scales
          // where the interference lives — then re-apply the fractional
          // initial zoom, which view creation snapped to an integer level.
          event.target.constraints.snapToZoom = false;
          event.target.zoom = INITIAL.zoom;
        }}
        onarcgisViewChange={handleViewChange}
      />
    </PlaygroundFrame>
  );
}
