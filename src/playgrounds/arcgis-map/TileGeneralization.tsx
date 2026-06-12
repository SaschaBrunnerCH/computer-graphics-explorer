import { useRef, useState } from "react";
import Basemap from "@arcgis/core/Basemap.js";
import VectorTileLayer from "@arcgis/core/layers/VectorTileLayer.js";
import "@arcgis/map-components/components/arcgis-map";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Cartographic generalization as mesh simplification's 2D cousin: two
 * MapViews on the same point of the Norwegian coast west of Bergen, the right
 * one locked exactly three tile levels below the left. Low-zoom vector tiles
 * carry geometry that was simplified offline — fewer vertices, smoothed bays,
 * dropped islets — and the renderer swaps it in by scale, exactly like LOD
 * meshes replacing detailed geometry at distance.
 *
 * Keyless service (curl-verified): the OpenStreetMap_v2 VectorTileServer on
 * basemaps.arcgis.com — vector linework, so what changes is the geometry
 * itself, not raster smoothing.
 */

const VECTOR_TILES_URL =
  "https://basemaps.arcgis.com/arcgis/rest/services/OpenStreetMap_v2/VectorTileServer";
const VECTOR_BASEMAP_ID = "osm-vector-tiles";

/** Øygarden archipelago west of Bergen — a maximally crinkly coastline. */
const CENTER: [number, number] = [4.95, 60.55];
const CENTER_ATTR = `${CENTER[0]}, ${CENTER[1]}`;

/** The right view always sits exactly this many tile levels below the left. */
const ZOOM_OFFSET = 3;
const ZOOM = { min: 9, max: 14, step: 0.5 };
const INITIAL = { zoom: 11 };

type Side = "left" | "right";

/** Our verified keyless vector-tile basemap (one instance per map element). */
const makeVectorBasemap = (): Basemap =>
  new Basemap({
    id: VECTOR_BASEMAP_ID,
    title: "OpenStreetMap (vector tiles)",
    baseLayers: [new VectorTileLayer({ url: VECTOR_TILES_URL, title: "OSM vector tiles" })],
  });

export default function TileGeneralization(): React.JSX.Element {
  const leftRef = useRef<HTMLArcgisMapElement | null>(null);
  const rightRef = useRef<HTMLArcgisMapElement | null>(null);
  // The element only creates its view once it has a map, so each map gets its
  // own basemap instance up front (a property, not a ready-handler swap).
  const [leftBasemap] = useState(makeVectorBasemap);
  const [rightBasemap] = useState(makeVectorBasemap);
  /** Which map the pointer last touched — only that one drives the sync. */
  const activeRef = useRef<Side | null>(null);
  const lastSyncRef = useRef(0);
  const trailingRef = useRef<number | undefined>(undefined);
  /** Zoom of the LEFT (detailed) view; the right view is always −3 levels. */
  const [zoom, setZoom] = useState(INITIAL.zoom);

  /** True once the view exists; all imperative access goes through this. */
  const readyMap = (side: Side): HTMLArcgisMapElement | null => {
    const el = (side === "left" ? leftRef : rightRef).current;
    return el && el.view ? el : null;
  };

  const handleReady = (el: HTMLArcgisMapElement): void => {
    // Continuous wheel zoom so interactive zooms land between levels too.
    el.constraints.snapToZoom = false;
  };

  /** Copy the active map's center across and re-impose the −3 zoom lock. */
  const syncFrom = (side: Side): void => {
    const src = readyMap(side);
    const tgt = readyMap(side === "left" ? "right" : "left");
    if (!src || !tgt) return;
    tgt.view.center = src.view.center.clone();
    const leftZoom = side === "left" ? src.view.zoom : src.view.zoom + ZOOM_OFFSET;
    const tgtZoom = side === "left" ? leftZoom - ZOOM_OFFSET : leftZoom;
    if (Math.abs(tgt.view.zoom - tgtZoom) > 1e-3) tgt.view.zoom = tgtZoom;
    const z = Math.round(leftZoom * 100) / 100;
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
    const left = readyMap("left");
    const right = readyMap("right");
    if (left) left.zoom = value;
    if (right) right.zoom = value - ZOOM_OFFSET;
  };

  const caption = `Same coastline, same center: the left map renders zoom ${zoom.toFixed(1)} tiles, the right the zoom ${(zoom - ZOOM_OFFSET).toFixed(1)} tiles the engine would use three levels further out. The coarse tiles were generalized offline — coastlines lose vertices, bays smooth out, small islets vanish entirely — and get swapped in by scale at runtime. That is mesh simplification's 2D cousin: precomputed LODs, selected by distance.`;

  return (
    <PlaygroundFrame
      title="Tile generalization on the Norwegian coast"
      caption={caption}
      onReset={() => {
        setZoom(INITIAL.zoom);
        activeRef.current = null;
        for (const side of ["left", "right"] as const) {
          const el = readyMap(side);
          if (el)
            void el
              .goTo(
                {
                  center: [...CENTER],
                  zoom: side === "left" ? INITIAL.zoom : INITIAL.zoom - ZOOM_OFFSET,
                },
                { animate: false },
              )
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
            format={(v) => `${v.toFixed(1)} / ${(v - ZOOM_OFFSET).toFixed(1)}`}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Pan either map — the other follows, holding the 3-level gap. Watch one island while
            sliding zoom: each integer level swaps in a differently simplified geometry, chosen
            offline by the tile pipeline the way LOD meshes are baked for 3D models.
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
            basemap={leftBasemap}
            center={CENTER_ATTR}
            zoom={INITIAL.zoom}
            popupDisabled
            onarcgisViewReadyChange={(event: { target: HTMLArcgisMapElement }) =>
              handleReady(event.target)
            }
            onarcgisViewChange={() => handleViewChange("left")}
          />
          <span className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
            Zoom {zoom.toFixed(1)} — full detail
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
            basemap={rightBasemap}
            center={CENTER_ATTR}
            zoom={INITIAL.zoom - ZOOM_OFFSET}
            popupDisabled
            onarcgisViewReadyChange={(event: { target: HTMLArcgisMapElement }) =>
              handleReady(event.target)
            }
            onarcgisViewChange={() => handleViewChange("right")}
          />
          <span className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
            Zoom {(zoom - ZOOM_OFFSET).toFixed(1)} — generalized
          </span>
        </div>
      </div>
    </PlaygroundFrame>
  );
}
