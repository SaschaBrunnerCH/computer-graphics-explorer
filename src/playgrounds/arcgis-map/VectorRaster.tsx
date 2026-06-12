import { useRef, useState } from "react";
import Basemap from "@arcgis/core/Basemap.js";
import VectorTileLayer from "@arcgis/core/layers/VectorTileLayer.js";
import "@arcgis/map-components/components/arcgis-map";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Rasterization in production: two MapViews over the same Zurich blocks. The
 * left map streams vector tiles (shapes + style) and rasterizes them on the
 * GPU every frame, so linework stays crisp at any fractional zoom. The right
 * map streams raster tiles — pixels pre-baked at integer zoom levels — which
 * can only be resampled between levels, so they go soft.
 *
 * Keyless services (curl-verified): the OpenStreetMap_v2 VectorTileServer on
 * basemaps.arcgis.com and the raster "osm" basemap (tile.openstreetmap.org).
 */

const VECTOR_TILES_URL =
  "https://basemaps.arcgis.com/arcgis/rest/services/OpenStreetMap_v2/VectorTileServer";
const VECTOR_BASEMAP_ID = "osm-vector-tiles";

/** Zurich old town around the main station — dense linework and labels. */
const CENTER: [number, number] = [8.5402, 47.3756];
const CENTER_ATTR = `${CENTER[0]}, ${CENTER[1]}`;

const ZOOM = { min: 12, max: 18, step: 0.25 };
const INITIAL = { zoom: 16 };

type Side = "left" | "right";

/** Our verified keyless vector-tile basemap (one instance per map element). */
const makeVectorBasemap = (): Basemap =>
  new Basemap({
    id: VECTOR_BASEMAP_ID,
    title: "OpenStreetMap (vector tiles)",
    baseLayers: [new VectorTileLayer({ url: VECTOR_TILES_URL, title: "OSM vector tiles" })],
  });

export default function VectorRaster(): React.JSX.Element {
  const leftRef = useRef<HTMLArcgisMapElement | null>(null);
  const rightRef = useRef<HTMLArcgisMapElement | null>(null);
  // The element only creates its view once it has a map, so the basemap must
  // be supplied up front (a property, not a ready-handler swap).
  const [vectorBasemap] = useState(makeVectorBasemap);
  /** Which map the pointer last touched — only that one drives the sync. */
  const activeRef = useRef<Side | null>(null);
  const lastSyncRef = useRef(0);
  const trailingRef = useRef<number | undefined>(undefined);
  const [zoom, setZoom] = useState(INITIAL.zoom);

  /** True once the view exists; all imperative access goes through this. */
  const readyMap = (side: Side): HTMLArcgisMapElement | null => {
    const el = (side === "left" ? leftRef : rightRef).current;
    return el && el.view ? el : null;
  };

  const handleReady = (el: HTMLArcgisMapElement): void => {
    // Continuous wheel zoom: fractional zooms are where the lesson lives.
    el.constraints.snapToZoom = false;
  };

  /** Copy the active map's center/zoom to the other and publish the zoom. */
  const syncFrom = (side: Side): void => {
    const src = readyMap(side);
    const tgt = readyMap(side === "left" ? "right" : "left");
    if (!src || !tgt) return;
    tgt.view.center = src.view.center.clone();
    if (Math.abs(tgt.view.zoom - src.view.zoom) > 1e-3) tgt.view.zoom = src.view.zoom;
    const z = Math.round(src.view.zoom * 100) / 100;
    setZoom((prev) => (prev === z ? prev : z));
  };

  const handleViewChange = (side: Side): void => {
    // One-way per gesture: only the map under the pointer propagates, so the
    // echo from the synced map can never feed back. Throttled to ~5/s with a
    // trailing call so the final position always lands.
    if (activeRef.current !== side) return;
    const now = performance.now();
    window.clearTimeout(trailingRef.current);
    if (now - lastSyncRef.current >= 200) {
      lastSyncRef.current = now;
      syncFrom(side);
    } else {
      trailingRef.current = window.setTimeout(() => {
        lastSyncRef.current = performance.now();
        syncFrom(side);
      }, 220);
    }
  };

  const applyZoom = (value: number): void => {
    setZoom(value);
    for (const side of ["left", "right"] as const) {
      const el = readyMap(side);
      if (el) el.zoom = value;
    }
  };

  const onLevel = Math.abs(zoom - Math.round(zoom)) < 0.01;
  const caption = `Zoom ${zoom.toFixed(2)} — ${
    onLevel
      ? "exactly on a tile level, so even the raster map shows its pixels at native resolution."
      : "between tile levels: the vector map re-rasterizes its shapes for this exact scale, while the raster map can only stretch pre-baked pixels, so its lines and labels go soft."
  } Vector tiles ship geometry that is rasterized live every frame; raster tiles ship pixels rendered once, at integer zoom levels only.`;

  return (
    <PlaygroundFrame
      title="Vector vs raster tiles over Zurich"
      caption={caption}
      onReset={() => {
        setZoom(INITIAL.zoom);
        activeRef.current = null;
        for (const side of ["left", "right"] as const) {
          const el = readyMap(side);
          if (el)
            void el
              .goTo({ center: [...CENTER], zoom: INITIAL.zoom }, { animate: false })
              .catch(() => undefined); // interrupted navigations reject — never crash on that
        }
      }}
      controls={
        <>
          <SliderControl
            label="Zoom"
            value={zoom}
            min={ZOOM.min}
            max={ZOOM.max}
            step={ZOOM.step}
            onInput={applyZoom}
            format={(v) => v.toFixed(2)}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Park the slider on a fractional zoom like 15.50 and compare street labels and thin
            lines. Panning or wheel-zooming either map moves the other — wheel zoom is continuous
            here, so it lands between levels too.
          </p>
        </>
      }
    >
      <div className="flex h-full w-full">
        <div
          className="relative min-w-0 flex-1"
          onPointerEnter={() => (activeRef.current = "left")}
          onPointerDown={() => (activeRef.current = "left")}
        >
          <arcgis-map
            ref={leftRef}
            className="block h-full w-full"
            basemap={vectorBasemap}
            center={CENTER_ATTR}
            zoom={INITIAL.zoom}
            popupDisabled
            onarcgisViewReadyChange={(event: { target: HTMLArcgisMapElement }) =>
              handleReady(event.target)
            }
            onarcgisViewChange={() => handleViewChange("left")}
          />
          <span className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
            Vector tiles
          </span>
        </div>
        <div
          className="relative min-w-0 flex-1 border-l border-[var(--calcite-color-border-3)]"
          onPointerEnter={() => (activeRef.current = "right")}
          onPointerDown={() => (activeRef.current = "right")}
        >
          <arcgis-map
            ref={rightRef}
            className="block h-full w-full"
            basemap="osm"
            center={CENTER_ATTR}
            zoom={INITIAL.zoom}
            popupDisabled
            onarcgisViewReadyChange={(event: { target: HTMLArcgisMapElement }) =>
              handleReady(event.target)
            }
            onarcgisViewChange={() => handleViewChange("right")}
          />
          <span className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
            Raster tiles
          </span>
        </div>
      </div>
    </PlaygroundFrame>
  );
}
