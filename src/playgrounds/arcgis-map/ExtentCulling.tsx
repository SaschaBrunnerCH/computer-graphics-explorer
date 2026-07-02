import { useEffect, useRef, useState } from "react";
import Graphic from "@arcgis/core/Graphic.js";
import Extent from "@arcgis/core/geometry/Extent.js";
import Point from "@arcgis/core/geometry/Point.js";
import SpatialReference from "@arcgis/core/geometry/SpatialReference.js";
import { lngLatToXY } from "@arcgis/core/geometry/support/webMercatorUtils.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol.js";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol.js";
import "@arcgis/map-components/components/arcgis-map";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Frustum culling with the camera flattened to a rectangle. In 2D the view
 * frustum degenerates to the axis-aligned view extent, so this is the same
 * visibility test as the 3D scene-frustum demo — just a rectangle instead of a
 * pyramid. LEFT: a live map over Switzerland you pan and zoom, carrying 250
 * seeded points. RIGHT: a locked, wider overview of the same region. As the
 * left extent moves we draw it as a rectangle on the overview and re-run
 * `extent.contains(point)` over all 250 points: the ones inside are what a real
 * engine would fetch and draw; everything outside is culled before any work.
 *
 * Keyless by construction: the plain "osm" raster basemap (tile.openstreetmap
 * .org). Both views are Web Mercator, so the seeded points and the containment
 * test are done in projected coordinates and stay exact.
 */

const POINT_COUNT = 250;
const SEED = 0x00c0_ffee;

/** Switzerland-ish spread for the seeded points (WGS84 degrees). */
const LON = { min: 6, max: 10.5 };
const LAT = { min: 45.8, max: 47.8 };

const MAIN_CENTER: [number, number] = [8.3, 46.8];
const MAIN_CENTER_ATTR = `${MAIN_CENTER[0]}, ${MAIN_CENTER[1]}`;
const MAIN_ZOOM = 8;
const OVERVIEW_ZOOM = 6;

const MAIN_POINTS_ID = "main-points";
const OVERVIEW_INCLUDED_ID = "overview-included";
const OVERVIEW_CULLED_ID = "overview-culled";
const OVERVIEW_RECT_ID = "overview-rect";

const COLOR_INCLUDED: [number, number, number, number] = [56, 189, 248, 0.9];
const COLOR_CULLED: [number, number, number, number] = [148, 163, 184, 0.45];

const INITIAL = { showCulled: true };

/** Deterministic LCG in [0, 1) — the same run always yields the same points. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

/** The 250 seeded points, precomputed once as Web Mercator geometry. */
const SEED_POINTS: Point[] = (() => {
  const rand = lcg(SEED);
  const points: Point[] = [];
  for (let i = 0; i < POINT_COUNT; i++) {
    const lon = LON.min + rand() * (LON.max - LON.min);
    const lat = LAT.min + rand() * (LAT.max - LAT.min);
    const [x, y] = lngLatToXY(lon, lat);
    points.push(new Point({ x, y, spatialReference: SpatialReference.WebMercator }));
  }
  return points;
})();

const marker = (color: [number, number, number, number]): SimpleMarkerSymbol =>
  new SimpleMarkerSymbol({
    style: "circle",
    size: 5,
    color,
    outline: { color: [0, 0, 0, 0], width: 0 },
  });

const INCLUDED_SYMBOL = marker(COLOR_INCLUDED);
const CULLED_SYMBOL = marker(COLOR_CULLED);

/** Bold outline, translucent fill — the view extent drawn on the overview. */
const RECT_SYMBOL = new SimpleFillSymbol({
  color: [250, 204, 21, 0.12],
  outline: { color: [250, 204, 21, 1], width: 2 },
});

type MapSide = "main" | "overview";

export default function ExtentCulling(): React.JSX.Element {
  const mainRef = useRef<HTMLArcgisMapElement | null>(null);
  const overviewRef = useRef<HTMLArcgisMapElement | null>(null);

  // Overview graphics layers, created once the overview view is ready.
  const includedLayerRef = useRef<GraphicsLayer | null>(null);
  const culledLayerRef = useRef<GraphicsLayer | null>(null);
  const rectLayerRef = useRef<GraphicsLayer | null>(null);

  // Throttle state for the extent watch (~100 ms with a trailing call).
  const lastSyncRef = useRef(0);
  const trailingRef = useRef<number | undefined>(undefined);
  /** Last main extent seen — replayed when the toggle flips without a pan. */
  const lastExtentRef = useRef<Extent | null>(null);
  const showCulledRef = useRef(INITIAL.showCulled);

  const [showCulled, setShowCulled] = useState(INITIAL.showCulled);
  const [counts, setCounts] = useState({ inside: POINT_COUNT, culled: 0 });

  useEffect(() => {
    showCulledRef.current = showCulled;
  }, [showCulled]);

  /** True once the view exists; all imperative access goes through this. */
  const readyMap = (side: MapSide): HTMLArcgisMapElement | null => {
    const el = (side === "main" ? mainRef : overviewRef).current;
    return el && el.view ? el : null;
  };

  /**
   * Recount which of the 250 points fall inside `extent` (our own containment
   * test) and repaint the overview: included points bright, culled points
   * dimmed (only when the toggle is on), plus the extent rectangle on top.
   */
  const refreshOverview = (extent: Extent | null | undefined): void => {
    if (!extent) return; // view.extent is null before the first layout
    lastExtentRef.current = extent;
    const included = includedLayerRef.current;
    const culled = culledLayerRef.current;
    const rect = rectLayerRef.current;
    if (!included || !culled || !rect) return;

    included.removeAll();
    culled.removeAll();
    rect.removeAll();

    const includedGraphics: Graphic[] = [];
    const culledGraphics: Graphic[] = [];
    for (const point of SEED_POINTS) {
      // 2D frustum test: the "frustum" is just the axis-aligned view extent.
      if (extent.contains(point)) {
        includedGraphics.push(new Graphic({ geometry: point, symbol: INCLUDED_SYMBOL }));
      } else if (showCulledRef.current) {
        culledGraphics.push(new Graphic({ geometry: point, symbol: CULLED_SYMBOL }));
      }
    }
    included.addMany(includedGraphics);
    culled.addMany(culledGraphics);
    rect.add(new Graphic({ geometry: extent.clone(), symbol: RECT_SYMBOL }));

    const inside = includedGraphics.length;
    setCounts((prev) => (prev.inside === inside ? prev : { inside, culled: POINT_COUNT - inside }));
  };

  /** Once both views exist and layers are built, draw the first frame. */
  const tryInitialRefresh = (): void => {
    const main = readyMap("main");
    if (main && includedLayerRef.current) refreshOverview(main.view.extent);
  };

  const handleMainReady = (el: HTMLArcgisMapElement): void => {
    // Lock rotation so the extent stays axis-aligned and `contains` is exact.
    el.view.constraints.rotationEnabled = false;
    if (el.map && !el.map.findLayerById(MAIN_POINTS_ID)) {
      const layer = new GraphicsLayer({ id: MAIN_POINTS_ID, title: "Seeded points" });
      layer.addMany(
        SEED_POINTS.map((point) => new Graphic({ geometry: point, symbol: INCLUDED_SYMBOL })),
      );
      el.map.add(layer);
    }
    tryInitialRefresh();
  };

  const handleOverviewReady = (el: HTMLArcgisMapElement): void => {
    const view = el.view;
    // Pin the overview: one scale, no rotation, no navigation chrome, and a
    // lateral-movement constraint set to its own starting extent.
    view.constraints.minZoom = OVERVIEW_ZOOM;
    view.constraints.maxZoom = OVERVIEW_ZOOM;
    view.constraints.rotationEnabled = false;
    view.constraints.geometry = view.extent.clone();
    view.ui.components = [];

    if (el.map && !el.map.findLayerById(OVERVIEW_CULLED_ID)) {
      const culled = new GraphicsLayer({ id: OVERVIEW_CULLED_ID, title: "Culled points" });
      const included = new GraphicsLayer({ id: OVERVIEW_INCLUDED_ID, title: "In-view points" });
      const rect = new GraphicsLayer({ id: OVERVIEW_RECT_ID, title: "View extent" });
      culledLayerRef.current = culled;
      includedLayerRef.current = included;
      rectLayerRef.current = rect;
      // Order: culled underneath, included above, rectangle on top.
      el.map.addMany([culled, included, rect]);
    }
    tryInitialRefresh();
  };

  /** Throttled extent watch on the main view — one-way to the overview. */
  const handleMainViewChange = (): void => {
    const el = readyMap("main");
    if (!el) return;
    const now = performance.now();
    window.clearTimeout(trailingRef.current);
    if (now - lastSyncRef.current >= 100) {
      lastSyncRef.current = now;
      refreshOverview(el.view.extent);
    } else {
      trailingRef.current = window.setTimeout(() => {
        lastSyncRef.current = performance.now();
        const cur = readyMap("main");
        if (cur) refreshOverview(cur.view.extent);
      }, 110);
    }
  };

  const applyShowCulled = (next: boolean): void => {
    setShowCulled(next);
    showCulledRef.current = next;
    if (lastExtentRef.current) refreshOverview(lastExtentRef.current);
  };

  // Clear any pending trailing sync on unmount.
  useEffect(() => () => window.clearTimeout(trailingRef.current), []);

  const caption = `${counts.culled} of ${POINT_COUNT} points outside the view — culled. In 2D the "frustum" is just your screen's extent: pan the left map and the rectangle sweeps the overview, and everything outside it never needs drawing or fetching. The 3D twin (scene-frustum above) is the same test with a pyramid instead of a rectangle.`;

  return (
    <PlaygroundFrame
      title="Extent culling — the 2D view frustum"
      caption={caption}
      onReset={() => {
        applyShowCulled(INITIAL.showCulled);
        const el = readyMap("main");
        if (el)
          void el
            .goTo({ center: [...MAIN_CENTER], zoom: MAIN_ZOOM }, { animate: false })
            .catch(() => undefined); // interrupted navigations reject — never crash on that
      }}
      controls={
        <>
          <SwitchControl
            label="Show culled points"
            checked={showCulled}
            onChange={applyShowCulled}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Frustum culling skips everything the camera cannot see before doing any work on it. In
            2D the frustum reduces to an axis-aligned extent — which is exactly why map engines
            index features spatially: so they can fetch only the tiles and features that intersect
            the view and drop the rest untouched.
          </p>
        </>
      }
    >
      <div className="flex h-full w-full">
        <div className="relative h-full min-w-0 flex-1">
          <arcgis-map
            ref={mainRef}
            className="block h-full w-full"
            basemap="osm"
            center={MAIN_CENTER_ATTR}
            zoom={MAIN_ZOOM}
            popupDisabled
            onarcgisViewReadyChange={(event: { target: HTMLArcgisMapElement }) =>
              handleMainReady(event.target)
            }
            onarcgisViewChange={handleMainViewChange}
          />
          <span className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
            Live view — pan & zoom
          </span>
        </div>
        <div className="relative h-full min-w-0 flex-1 border-l border-[var(--calcite-color-border-3)]">
          <arcgis-map
            ref={overviewRef}
            className="block h-full w-full"
            basemap="osm"
            center={MAIN_CENTER_ATTR}
            zoom={OVERVIEW_ZOOM}
            popupDisabled
            onarcgisViewReadyChange={(event: { target: HTMLArcgisMapElement }) =>
              handleOverviewReady(event.target)
            }
          />
          <span className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
            Overview — {counts.inside} in view, {counts.culled} culled
          </span>
        </div>
      </div>
    </PlaygroundFrame>
  );
}
