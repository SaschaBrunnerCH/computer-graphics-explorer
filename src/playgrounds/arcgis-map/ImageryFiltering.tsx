import { useRef, useState } from "react";
import EsriMap from "@arcgis/core/Map.js";
import ImageryTileLayer from "@arcgis/core/layers/ImageryTileLayer.js";
import TileInfo from "@arcgis/core/layers/support/TileInfo.js";
import RasterStretchRenderer from "@arcgis/core/renderers/RasterStretchRenderer.js";
import MultipartColorRamp from "@arcgis/core/rest/support/MultipartColorRamp.js";
import MapViewConstraints from "@arcgis/core/views/2d/MapViewConstraints.js";
import "@arcgis/map-components/components/arcgis-map";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Texture magnification on real Earth data: Esri's keyless Terrain3D
 * elevation service (32-bit float LERC tiles, deepest cache level 16 at
 * ~2.4 m/pixel) zoomed far past its native resolution over the Matterhorn.
 * ImageryTileLayer resamples the raw pixels client-side, and its
 * `interpolation` property is runtime-settable — the same
 * nearest/bilinear/cubic choice a GPU sampler makes, on actual terrain.
 */

const TERRAIN_URL =
  "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";

/** Deepest cached tile level of the service (≈2.39 m/pixel in Web Mercator). */
const NATIVE_LEVEL = 16;

/** Matterhorn east face — steep, high-contrast elevation gradients. */
const CENTER: [number, number] = [7.6605, 45.9772];

type Interpolation = "nearest" | "bilinear" | "cubic";

const INITIAL = { interpolation: "nearest" as Interpolation, zoom: 19 };

const ZOOM_MIN = 15;
const ZOOM_MAX = 21;

/**
 * Hypsometric ramp auto-stretched (DRA) to the heights currently in view, so
 * adjacent elevation samples always land on distinct hues — at zoom 19 the
 * view spans only ~150 m of height, a sliver of any fixed window.
 */
const buildRenderer = (): RasterStretchRenderer =>
  new RasterStretchRenderer({
    stretchType: "min-max",
    dynamicRangeAdjustment: true,
    colorRamp: new MultipartColorRamp({
      colorRamps: [
        { fromColor: "#1f6e43", toColor: "#dfd693" },
        { fromColor: "#dfd693", toColor: "#9c5b34" },
        { fromColor: "#9c5b34", toColor: "#ffffff" },
      ],
    }),
  });

// Module-level singletons (this chunk is lazy-loaded): constructing a layer
// triggers no network until a view displays it. handleViewReady re-syncs the
// layer to INITIAL so a later revisit starts fresh; mutations happen only in
// event handlers (never during render).
const imageryLayer = new ImageryTileLayer({
  url: TERRAIN_URL,
  interpolation: INITIAL.interpolation,
  renderer: buildRenderer(),
});
const sharedMap = new EsriMap({ layers: [imageryLayer] });
// The service cache stops at level 16; extra LODs let the view overzoom so
// one source pixel spans many screen pixels (true magnification).
const overzoomConstraints = new MapViewConstraints({
  lods: TileInfo.create({ numLODs: 24 }).lods,
  snapToZoom: false,
});

const MODE_TEXT: Record<Interpolation, string> = {
  nearest:
    "Nearest copies the single closest sample into every screen pixel — the same hard blocky squares as the magnified checkerboard above.",
  bilinear:
    "Bilinear blends the 4 surrounding samples with distance weights — smooth ramps, slightly soft.",
  cubic:
    "Cubic fits a curve through 16 surrounding samples — the smoothest gradients while keeping edges crisper than bilinear.",
};

export default function ImageryFiltering(): React.JSX.Element {
  const mapElRef = useRef<HTMLArcgisMapElement | null>(null);
  const lastUpdateRef = useRef(0);
  const trailingRef = useRef<number | undefined>(undefined);
  const [interpolation, setInterpolation] = useState<Interpolation>(INITIAL.interpolation);
  const [zoom, setZoom] = useState(INITIAL.zoom);

  /** True once the view exists; all imperative access goes through this. */
  const readyMap = (): HTMLArcgisMapElement | null => {
    const el = mapElRef.current;
    return el && el.view ? el : null;
  };

  /** Read the current zoom off the view and publish it (deduped via rounding). */
  const updateZoomReadout = (): void => {
    const z = readyMap()?.view?.zoom;
    if (z == null || !Number.isFinite(z)) return;
    setZoom(Math.round(z * 100) / 100);
  };

  const handleViewReady = (): void => {
    // The layer outlives the component (module singleton): re-sync it to the
    // fresh INITIAL React state. StrictMode re-fires this; it's idempotent.
    imageryLayer.interpolation = INITIAL.interpolation;
  };

  const handleViewChange = (): void => {
    // Throttle: fires every frame while navigating; a trailing timeout
    // guarantees the final value lands after the burst ends.
    const now = performance.now();
    window.clearTimeout(trailingRef.current);
    if (now - lastUpdateRef.current >= 200) {
      lastUpdateRef.current = now;
      updateZoomReadout();
    } else {
      trailingRef.current = window.setTimeout(() => {
        lastUpdateRef.current = performance.now();
        updateZoomReadout();
      }, 220);
    }
  };

  // Screen pixels per source sample: each zoom level doubles the on-screen
  // size of a level-16 sample, so magnification = 2^(zoom − 16).
  const magnification = Math.pow(2, zoom - NATIVE_LEVEL);
  const magText =
    magnification >= 1.1
      ? `one ~2.4 m elevation sample covers ≈ ${magnification.toFixed(magnification < 4 ? 1 : 0)}×${magnification.toFixed(magnification < 4 ? 1 : 0)} screen pixels`
      : "samples and screen pixels are roughly 1:1, so the modes barely differ — zoom in";

  const caption = `Magnification on real data: ${magText}. ${MODE_TEXT[interpolation]}`;

  return (
    <PlaygroundFrame
      title="Nearest vs bilinear vs cubic on real terrain"
      caption={caption}
      onReset={() => {
        setInterpolation(INITIAL.interpolation);
        setZoom(INITIAL.zoom);
        imageryLayer.interpolation = INITIAL.interpolation;
        const el = readyMap();
        if (el) void el.goTo({ center: CENTER, zoom: INITIAL.zoom }).catch(() => undefined);
      }}
      controls={
        <>
          <SegmentedControl<Interpolation>
            label="Interpolation"
            value={interpolation}
            options={[
              { value: "nearest", label: "Nearest" },
              { value: "bilinear", label: "Bilinear" },
              { value: "cubic", label: "Cubic" },
            ]}
            onChange={(mode) => {
              setInterpolation(mode);
              imageryLayer.interpolation = mode;
            }}
          />
          <SliderControl
            label="Zoom"
            value={Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))}
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={0.25}
            format={(v) => v.toFixed(2)}
            onInput={(v) => {
              setZoom(v);
              const el = readyMap();
              if (el) el.zoom = v;
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            The Terrain3D service stores raw 32-bit float heights in LERC tiles whose deepest level
            is ~2.4 m/pixel. The browser resamples those same pixels client-side, so flipping the
            mode re-filters instantly — no new requests. The color ramp auto-stretches to the
            heights currently in view (dynamic range adjustment), keeping contrast high at every
            zoom. This is the magnification half of the checkerboard demo&apos;s
            minification/magnification story.
          </p>
        </>
      }
    >
      <arcgis-map
        ref={mapElRef}
        className="block h-full w-full"
        map={sharedMap}
        constraints={overzoomConstraints}
        center={CENTER}
        zoom={INITIAL.zoom}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
        onarcgisViewChange={handleViewChange}
      />
    </PlaygroundFrame>
  );
}
