import { useEffect, useRef, useState } from "react";
import EsriMap from "@arcgis/core/Map.js";
import ImageryTileLayer from "@arcgis/core/layers/ImageryTileLayer.js";
import RasterStretchRenderer from "@arcgis/core/renderers/RasterStretchRenderer.js";
import "@arcgis/map-components/components/arcgis-map";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Tone mapping in production: Esri's keyless Terrain3D service delivers raw
 * 32-bit float heights (−450…8700 m globally), but the screen has 256 gray
 * levels. The RasterStretchRenderer's min-max window + gamma IS a tone-mapping
 * curve, rebuilt at runtime from sliders; dynamic range adjustment (DRA)
 * recomputes the window from the visible pixels — auto-exposure for rasters.
 */

const TERRAIN_URL =
  "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";

/** Global value range of the service (its own published statistics). */
const DATA_MIN = -450;
const DATA_MAX = 8700;

/** Valais: Rhone valley floor (~650 m) to Monte Rosa (4634 m) in one view. */
const CENTER: [number, number] = [7.8, 46.1];
const ZOOM = 10;

const INITIAL = { displayMin: DATA_MIN, displayMax: DATA_MAX, gamma: 1, dra: false };

const buildRenderer = (s: {
  displayMin: number;
  displayMax: number;
  gamma: number;
  dra: boolean;
}): RasterStretchRenderer =>
  new RasterStretchRenderer({
    stretchType: "min-max",
    customStatistics: [{ min: s.displayMin, max: s.displayMax }],
    dynamicRangeAdjustment: s.dra,
    useGamma: true,
    gamma: [s.gamma],
  });

export default function ImageryTone(): React.JSX.Element {
  // The map is per-mount state, NOT a module singleton: the <arcgis-map>
  // element destroys the Map it was given when it leaves the DOM, so a shared
  // instance comes back "already destroyed" on the next visit and the view
  // stays black. Constructing it here still triggers no network until a view
  // displays it. Handlers reach the (mutable) layer through the element — see
  // readyLayer — so the state binding itself is never written.
  const [sharedMap] = useState(
    () =>
      new EsriMap({
        layers: [new ImageryTileLayer({ url: TERRAIN_URL, renderer: buildRenderer(INITIAL) })],
      }),
  );
  const mapElRef = useRef<HTMLArcgisMapElement | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  const [displayMin, setDisplayMin] = useState(INITIAL.displayMin);
  const [displayMax, setDisplayMax] = useState(INITIAL.displayMax);
  const [gamma, setGamma] = useState(INITIAL.gamma);
  const [dra, setDra] = useState(INITIAL.dra);

  useEffect(() => () => window.clearTimeout(debounceRef.current), []);

  /** True once the view exists; all imperative access goes through this. */
  const readyMap = (): HTMLArcgisMapElement | null => {
    const el = mapElRef.current;
    return el && el.view ? el : null;
  };

  /** The imagery layer, fetched via the element (handlers only; null pre-view). */
  const readyLayer = (): ImageryTileLayer | null => {
    const layer = readyMap()?.view.map?.layers.at(0);
    return layer instanceof ImageryTileLayer ? layer : null;
  };

  /** Rebuild the renderer debounced (~200 ms) so slider scrubs don't thrash it. */
  const scheduleRenderer = (next: {
    displayMin: number;
    displayMax: number;
    gamma: number;
    dra: boolean;
  }): void => {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const layer = readyLayer();
      if (layer) layer.renderer = buildRenderer(next);
    }, 200);
  };

  const handleViewReady = (): void => {
    // StrictMode re-fires this on its simulated remount; it's idempotent.
    const layer = readyLayer();
    if (layer) layer.renderer = buildRenderer(INITIAL);
  };

  const windowText = dra
    ? "Auto-exposure (DRA) recomputes the black/white window from only the pixels on screen as you pan and zoom — a camera's auto-exposure, or the HDR eye-adaptation pass, in GIS clothing."
    : `Heights from ${displayMin.toLocaleString("en-US")} m to ${displayMax.toLocaleString("en-US")} m are spread across the 256 displayable grays; anything below crushes to black, anything above clips to white${
        displayMax - displayMin > 6000
          ? " — this full global window wastes most gray levels on heights that never occur here, so the Alps look flat. Narrow it to ≈650–4600 m"
          : ""
      }.`;
  const gammaText =
    Math.abs(gamma - 1) > 0.024
      ? ` Gamma ${gamma.toFixed(2)} bends the midtones ${gamma < 1 ? "brighter" : "darker"} without moving black or white — the same curve as the gamma demo above.`
      : "";
  const caption = `Choosing this mapping IS tone mapping: ${windowText}${gammaText}`;

  return (
    <PlaygroundFrame
      title="Elevation stretch: 32-bit terrain on an 8-bit screen"
      caption={caption}
      onReset={() => {
        setDisplayMin(INITIAL.displayMin);
        setDisplayMax(INITIAL.displayMax);
        setGamma(INITIAL.gamma);
        setDra(INITIAL.dra);
        window.clearTimeout(debounceRef.current);
        const layer = readyLayer();
        if (layer) layer.renderer = buildRenderer(INITIAL);
        const el = readyMap();
        if (el) void el.goTo({ center: CENTER, zoom: ZOOM }).catch(() => undefined);
      }}
      controls={
        <>
          <SwitchControl
            label="Auto-exposure (DRA)"
            checked={dra}
            onChange={(on) => {
              setDra(on);
              scheduleRenderer({ displayMin, displayMax, gamma, dra: on });
            }}
          />
          {!dra && (
            <>
              <SliderControl
                label="Display min"
                value={displayMin}
                min={DATA_MIN}
                max={DATA_MAX}
                step={25}
                format={(v) => `${v.toLocaleString("en-US")} m`}
                onInput={(v) => {
                  const next = Math.min(v, displayMax - 100);
                  setDisplayMin(next);
                  scheduleRenderer({ displayMin: next, displayMax, gamma, dra });
                }}
              />
              <SliderControl
                label="Display max"
                value={displayMax}
                min={DATA_MIN}
                max={DATA_MAX}
                step={25}
                format={(v) => `${v.toLocaleString("en-US")} m`}
                onInput={(v) => {
                  const next = Math.max(v, displayMin + 100);
                  setDisplayMax(next);
                  scheduleRenderer({ displayMin, displayMax: next, gamma, dra });
                }}
              />
            </>
          )}
          <SliderControl
            label="Gamma"
            value={gamma}
            min={0.3}
            max={3}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onInput={(v) => {
              setGamma(v);
              scheduleRenderer({ displayMin, displayMax, gamma: v, dra });
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            The sensor side of the HDR story: this elevation service ships raw 32-bit float values
            (−450…8700 m worldwide) in LERC tiles, and satellite sensors likewise capture 11–16 bits
            per band. Your display shows 8. The stretch renderer is the production tone-mapping
            operator that decides what survives the squeeze.
          </p>
        </>
      }
    >
      <arcgis-map
        ref={mapElRef}
        className="block h-full w-full"
        map={sharedMap}
        center={CENTER}
        zoom={ZOOM}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
    </PlaygroundFrame>
  );
}
