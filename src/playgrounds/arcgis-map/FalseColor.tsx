import { useRef, useState } from "react";
import EsriMap from "@arcgis/core/Map.js";
import ImageryLayer from "@arcgis/core/layers/ImageryLayer.js";
import "@arcgis/map-components/components/arcgis-map";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * A color space is a *convention* for what pixel numbers mean, not a property
 * of the light. Esri's keyless Toronto ImageServer ships a 4-band aerial: its
 * bands are ['Blue','Green','Red','NearInfrared'] → indices Blue=0, Green=1,
 * Red=2, NIR=3. Choosing which three bands drive the screen's R/G/B channels
 * (ImageryLayer.bandIds) is choosing a color space over the same pixels.
 *
 * "Natural" maps Red/Green/Blue → R/G/B — so habitual it reads as "no mapping".
 * "Infrared (CIR)" maps NIR/Red/Green → R/G/B — vegetation floods the red
 * channel because leaves reflect near-infrared intensely. Same numbers, a
 * different convention.
 *
 * The sensor captured each band at 11 bits (values ~1…2047); the export
 * squeezes that to the 8 bits per channel your screen shows — a display
 * mapping the service performs for us. We keep the band composite honest by
 * exporting lossless png32 (no jpeg chroma smearing across the band math), so a
 * RasterStretchRenderer (a single-band grayscale/colormap operator) would
 * collapse the three-band composites and is deliberately not used here.
 */

/** Curl-verified keyless 4-band aerial: exportImage returns 200 without a key. */
const TORONTO_URL =
  "https://sampleserver6.arcgisonline.com/arcgis/rest/services/Toronto/ImageServer";

/** Toronto Islands — parkland, open water and downtown towers in one frame. */
const CENTER: [number, number] = [-79.379, 43.62];
const ZOOM = 13;

type Mapping = "natural" | "cir" | "nir";

/**
 * Each option picks the three source bands that drive screen R, G, B.
 * Band indices for this service: Blue=0, Green=1, Red=2, NIR=3.
 */
const BANDS: Record<Mapping, number[]> = {
  natural: [2, 1, 0], // Red, Green, Blue → R, G, B
  cir: [3, 2, 1], // NIR, Red, Green → R, G, B (classic color-infrared)
  nir: [3, 3, 3], // NIR on all three channels → grayscale reflectance
};

const INITIAL: Mapping = "natural";

// Module-level singletons (this chunk is lazy-loaded): constructing the layer
// triggers no network until a view displays it. bandIds is a runtime-settable
// accessor, mutated only in event handlers (never during render). png32 keeps
// the export lossless so the band composite stays faithful to the raw pixels.
const imageryLayer = new ImageryLayer({
  url: TORONTO_URL,
  format: "png32",
  bandIds: BANDS[INITIAL],
});
const sharedMap = new EsriMap({ basemap: "osm", layers: [imageryLayer] });

type LoadStatus = "loading" | "ready" | "failed";

const CAPTIONS: Record<Mapping, string> = {
  natural:
    "Bands Red/Green/Blue → your screen's R/G/B — the mapping is so habitual it feels like 'no mapping at all'.",
  cir: "Same pixels, remapped: NearInfrared→R, Red→G, Green→B. Vegetation floods the red channel because leaves reflect NIR intensely — a color space is a convention for what the numbers mean, not a property of the light.",
  nir: "One band on all three channels — pure NIR reflectance as grayscale.",
};

export default function FalseColor(): React.JSX.Element {
  const mapElRef = useRef<HTMLArcgisMapElement | null>(null);
  const [mapping, setMapping] = useState<Mapping>(INITIAL);
  const [status, setStatus] = useState<LoadStatus>("loading");

  /** True once the view exists; all imperative access goes through this. */
  const readyMap = (): HTMLArcgisMapElement | null => {
    const el = mapElRef.current;
    return el && el.view ? el : null;
  };

  const applyMapping = (m: Mapping): void => {
    imageryLayer.bandIds = BANDS[m];
  };

  const handleViewReady = (): void => {
    // The layer outlives the component (module singleton): re-sync its bandIds
    // to the current React state. StrictMode re-fires this; it's idempotent.
    applyMapping(mapping);
    // Surface an honest failure if the external service can't load.
    imageryLayer
      .load()
      .then(() => setStatus("ready"))
      .catch(() => setStatus("failed"));
  };

  const caption =
    status === "failed"
      ? "The Toronto aerial service failed to load — reload the page to retry. It's an external sample service and may be briefly unavailable."
      : `${status === "loading" ? "Loading the 4-band aerial… " : ""}${CAPTIONS[mapping]} The sensor captured each band at 11 bits (values 0–2047); your screen shows 8 (0–255), so the export squeezes every band into 256 levels before you ever see it.`;

  return (
    <PlaygroundFrame
      title="Same pixels, different color space — 4-band Toronto"
      caption={caption}
      onReset={() => {
        setMapping(INITIAL);
        applyMapping(INITIAL);
        const el = readyMap();
        if (el) void el.goTo({ center: [...CENTER], zoom: ZOOM }).catch(() => undefined);
      }}
      controls={
        <>
          <SegmentedControl<Mapping>
            label="Band mapping"
            value={mapping}
            options={[
              { value: "natural", label: "Natural" },
              { value: "cir", label: "Infrared (CIR)" },
              { value: "nir", label: "NIR only" },
            ]}
            onChange={(m) => {
              setMapping(m);
              applyMapping(m);
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Every pixel here holds four numbers — Blue, Green, Red and NearInfrared. Which three you
            route to the screen's R/G/B is the color space. "Natural" feels like reality only
            because it matches the convention your eyes were trained on; "Infrared" reads the exact
            same pixels through a different one, and suddenly healthy vegetation glows red.
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
