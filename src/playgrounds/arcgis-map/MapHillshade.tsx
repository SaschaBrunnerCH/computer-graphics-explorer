import { useEffect, useRef, useState } from "react";
import EsriMap from "@arcgis/core/Map.js";
import ImageryTileLayer from "@arcgis/core/layers/ImageryTileLayer.js";
import RasterShadedReliefRenderer from "@arcgis/core/renderers/RasterShadedReliefRenderer.js";
import "@arcgis/map-components/components/arcgis-map";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Hillshade IS bump mapping's exact math on real Earth: the same keyless
 * Terrain3D elevation service (raw 32-bit float heights) the filtering/tone
 * demos use, rendered with RasterShadedReliefRenderer. For every screen pixel
 * it derives a surface normal from the neighbouring elevation samples and
 * shades it N·L against a sun direction — no geometry displaced, exactly the
 * normal/bump-map recipe applied to Switzerland instead of a brick texture.
 */

const TERRAIN_URL =
  "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";

/** Bernese Alps — Eiger / Mönch / Jungfrau relief, high-contrast ridges. */
const CENTER: [number, number] = [7.99, 46.45];
const ZOOM = 10;

type HillshadeType = "traditional" | "multi-directional";

interface HillshadeState {
  azimuth: number;
  altitude: number;
  zFactor: number;
  hillshadeType: HillshadeType;
}

const INITIAL: HillshadeState = {
  azimuth: 315,
  altitude: 45,
  zFactor: 1,
  hillshadeType: "traditional",
};

// scalingType "none" keeps z-factor a direct multiplier on the height field
// before the slope/aspect derivative, so the exaggeration reads purely in the
// shading — the 2D twin of the terrain-exaggeration scene.
const buildRenderer = (s: HillshadeState): RasterShadedReliefRenderer =>
  new RasterShadedReliefRenderer({
    azimuth: s.azimuth,
    altitude: s.altitude,
    zFactor: s.zFactor,
    hillshadeType: s.hillshadeType,
    scalingType: "none",
  });

export default function MapHillshade(): React.JSX.Element {
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
  const [azimuth, setAzimuth] = useState(INITIAL.azimuth);
  const [altitude, setAltitude] = useState(INITIAL.altitude);
  const [zFactor, setZFactor] = useState(INITIAL.zFactor);
  const [hillshadeType, setHillshadeType] = useState<HillshadeType>(INITIAL.hillshadeType);

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

  /**
   * Apply state to the renderer, debounced (~200 ms) so slider scrubs don't
   * thrash it. IMPORTANT: we CLONE the layer's current renderer and mutate the
   * clone rather than constructing a fresh instance — under Vite's dev
   * pre-bundling, a newly constructed RasterShadedReliefRenderer can come from
   * a different module copy than the one the layer's type-check expects
   * ("not a subclass of itself"); a clone always stays in the accepted realm
   * and the assignment still triggers a redraw.
   */
  const applyRenderer = (next: HillshadeState): void => {
    const layer = readyLayer();
    if (!layer) return;
    const current = layer.renderer;
    if (!(current instanceof RasterShadedReliefRenderer)) return;
    const r = current.clone();
    r.azimuth = next.azimuth;
    r.altitude = next.altitude;
    r.zFactor = next.zFactor;
    r.hillshadeType = next.hillshadeType;
    layer.renderer = r;
  };

  const scheduleRenderer = (next: HillshadeState): void => {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => applyRenderer(next), 200);
  };

  const handleViewReady = (): void => {
    // StrictMode re-fires this on its simulated remount; it's idempotent.
    applyRenderer(INITIAL);
  };

  const inversionText =
    azimuth > 90 && azimuth < 225
      ? " — lit from the south/east, the relief pops inside-out: valleys read as ridges (relief inversion, because your brain assumes light from the top-left)."
      : ".";
  const typeText =
    hillshadeType === "multi-directional"
      ? " Multi-directional blends several light directions at once, so detail survives in the deep shadows and over-lit faces a single sun would flatten."
      : "";
  const caption = `Sun from ${azimuth}° at ${altitude}° altitude, z-factor ${zFactor.toFixed(1)} — every pixel's brightness is N·L, where N comes from the neighbouring elevation samples: bump mapping's exact recipe, applied to Switzerland instead of a brick texture${inversionText}${typeText}`;

  return (
    <PlaygroundFrame
      title="Hillshade: bump mapping on real terrain"
      caption={caption}
      onReset={() => {
        setAzimuth(INITIAL.azimuth);
        setAltitude(INITIAL.altitude);
        setZFactor(INITIAL.zFactor);
        setHillshadeType(INITIAL.hillshadeType);
        window.clearTimeout(debounceRef.current);
        const layer = readyLayer();
        if (layer) layer.renderer = buildRenderer(INITIAL);
        const el = readyMap();
        if (el) void el.goTo({ center: CENTER, zoom: ZOOM }).catch(() => undefined);
      }}
      controls={
        <>
          <SliderControl
            label="Sun azimuth"
            value={azimuth}
            min={0}
            max={360}
            step={15}
            format={(v) => `${v}°`}
            onInput={(v) => {
              setAzimuth(v);
              scheduleRenderer({ azimuth: v, altitude, zFactor, hillshadeType });
            }}
          />
          <SliderControl
            label="Sun altitude"
            value={altitude}
            min={5}
            max={90}
            step={5}
            format={(v) => `${v}°`}
            onInput={(v) => {
              setAltitude(v);
              scheduleRenderer({ azimuth, altitude: v, zFactor, hillshadeType });
            }}
          />
          <SliderControl
            label="Z-factor"
            value={zFactor}
            min={0.5}
            max={5}
            step={0.5}
            format={(v) => v.toFixed(1)}
            onInput={(v) => {
              setZFactor(v);
              scheduleRenderer({ azimuth, altitude, zFactor: v, hillshadeType });
            }}
          />
          <SegmentedControl<HillshadeType>
            label="Hillshade"
            value={hillshadeType}
            options={[
              { value: "traditional", label: "Traditional" },
              { value: "multi-directional", label: "Multi-directional" },
            ]}
            onChange={(mode) => {
              setHillshadeType(mode);
              scheduleRenderer({ azimuth, altitude, zFactor, hillshadeType: mode });
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Hillshade derives a surface normal from the height field&apos;s slope and aspect, then
            dots it with a light direction — the identical math to the normal-map demo above, but
            the normal is computed from real elevation instead of a texture. Azimuth and altitude
            place the sun; z-factor scales the heights before the derivative, so vertical
            exaggeration lives entirely in the shading, no geometry moved. Sweep azimuth to ~135°
            (SE) and the ridges and valleys invert.
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
