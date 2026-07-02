import { useRef, useState } from "react";
import Graphic from "@arcgis/core/Graphic.js";
import Polygon from "@arcgis/core/geometry/Polygon.js";
import SpatialReference from "@arcgis/core/geometry/SpatialReference.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol.js";
import "@arcgis/map-components/components/arcgis-map";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * The painter's algorithm, made literal. A 2D map has no depth buffer: what you
 * see where shapes overlap is decided by drawing order alone — later paint
 * covers earlier, back-to-front, every frame. Three client-side GraphicsLayers,
 * each holding one big bold polygon over Lake Zurich, overlap in the middle.
 * Reordering a layer to the top makes its shape win — instantly, everywhere,
 * with no contest, because there is nothing per-pixel to decide.
 *
 * This is the contrast to the z-fighting scene: 3D surfaces at the same depth
 * fight because a z-buffer arbitrates per pixel; a map never fights because
 * order *is* visibility. Keyless by construction (OSM basemap, client geometry).
 */

/** Lake Zurich — a neutral spot with water and shore for the shapes to sit on. */
const CENTER: [number, number] = [8.55, 47.25];
const CENTER_ATTR = `${CENTER[0]}, ${CENTER[1]}`;
const ZOOM = 11;

const KM_PER_DEG_LAT = 110.574;
const kmToLat = (km: number): number => km / KM_PER_DEG_LAT;
const kmToLng = (km: number, lat: number): number =>
  km / (111.32 * Math.cos((lat * Math.PI) / 180));

type ShapeId = "triangle" | "circle" | "square";
const SHAPE_IDS: readonly ShapeId[] = ["triangle", "circle", "square"];

const INITIAL = { top: "square" as ShapeId, opacity: 1 };

/** A ring of [lng, lat] pairs closed on itself, sized in kilometres. */
function ring(points: readonly [number, number][]): number[][] {
  return [...points, points[0]].map(([x, y]) => [x, y]);
}

/** Regular-polygon ring around (cx, cy): `sides` verts, first at `startDeg`. */
function polyRing(
  cx: number,
  cy: number,
  radiusKm: number,
  sides: number,
  startDeg: number,
): number[][] {
  const points: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = ((startDeg + (i * 360) / sides) * Math.PI) / 180;
    points.push([cx + kmToLng(Math.cos(a) * radiusKm, cy), cy + kmToLat(Math.sin(a) * radiusKm)]);
  }
  return ring(points);
}

/** Big bold shapes offset a couple of KILOMETRES from centre so all three overlap. */
const SHAPES: Record<
  ShapeId,
  { glyph: string; name: string; rings: number[][][]; fill: number[]; outline: number[] }
> = {
  triangle: {
    glyph: "△",
    name: "triangle",
    // Points up, apex toward the top; sits low so it pokes below the others.
    rings: [polyRing(CENTER[0], CENTER[1] + kmToLat(-1.8), 3.9, 3, 90)],
    fill: [245, 158, 11, 0.85], // amber
    outline: [146, 88, 4, 1],
  },
  circle: {
    glyph: "◯",
    name: "circle",
    rings: [polyRing(CENTER[0] + kmToLng(-2.2, CENTER[1]), CENTER[1] + kmToLat(0.6), 3.6, 64, 0)],
    fill: [220, 38, 62, 0.85], // crimson
    outline: [136, 12, 30, 1],
  },
  square: {
    glyph: "□",
    name: "square",
    // 45°-offset 4-gon gives axis-aligned corners → a diamond-free square.
    rings: [polyRing(CENTER[0] + kmToLng(2.2, CENTER[1]), CENTER[1] + kmToLat(0.6), 4.1, 4, 45)],
    fill: [37, 99, 235, 0.85], // blue
    outline: [23, 51, 140, 1],
  },
};

const ORDER_OPTIONS = SHAPE_IDS.map((id) => ({
  value: id,
  label: `${SHAPES[id].glyph} on top`,
}));

const LAYER_ID = (id: ShapeId): string => `painters-${id}`;

/** One GraphicsLayer per shape, each carrying its single filled polygon. */
function buildLayer(id: ShapeId): GraphicsLayer {
  const shape = SHAPES[id];
  return new GraphicsLayer({
    id: LAYER_ID(id),
    title: shape.name,
    graphics: [
      new Graphic({
        geometry: new Polygon({
          rings: shape.rings,
          spatialReference: SpatialReference.WGS84,
        }),
        symbol: new SimpleFillSymbol({
          style: "solid",
          color: shape.fill,
          outline: { color: shape.outline, width: 2.5 },
        }),
      }),
    ],
  });
}

export default function PaintersOrder(): React.JSX.Element {
  const mapRef = useRef<HTMLArcgisMapElement | null>(null);
  const [top, setTop] = useState<ShapeId>(INITIAL.top);
  const [opacity, setOpacity] = useState(INITIAL.opacity);

  /** True once the view exists; all imperative access goes through this. */
  const readyMap = (): HTMLArcgisMapElement | null => {
    const el = mapRef.current;
    return el && el.view && el.map ? el : null;
  };

  /**
   * Put `topId` last in the layer list (drawn last = on top) and apply the
   * opacity to that layer only, leaving the others fully opaque. The reorder is
   * the whole lesson: visibility is layer order, nothing per-pixel.
   */
  const applyState = (topId: ShapeId, op: number): void => {
    const el = readyMap();
    if (!el?.map) return;
    const map = el.map;
    const topLayer = map.findLayerById(LAYER_ID(topId));
    // Collection.reorder(item, index): move the chosen layer to the last slot.
    if (topLayer) map.layers.reorder(topLayer, map.layers.length - 1);
    for (const id of SHAPE_IDS) {
      const layer = map.findLayerById(LAYER_ID(id));
      if (layer) layer.opacity = id === topId ? op : 1;
    }
  };

  const handleViewReady = (event: { target: HTMLArcgisMapElement }): void => {
    const el = event.target;
    if (!el.map) return;
    // StrictMode-safe: add each layer only if it is not already present, so the
    // mount→cleanup→remount double-invoke never stacks duplicate layers.
    for (const id of SHAPE_IDS) {
      if (!el.map.findLayerById(LAYER_ID(id))) el.map.add(buildLayer(id));
    }
    applyState(top, opacity);
  };

  const handleOrderChange = (id: ShapeId): void => {
    setTop(id);
    applyState(id, opacity);
  };

  const handleOpacityChange = (value: number): void => {
    setOpacity(value);
    applyState(top, value);
  };

  const name = SHAPES[top].name;
  const caption =
    `The ${name} paints last, so the ${name} wins — everywhere it overlaps, ` +
    `deterministically, with no flicker. ` +
    (opacity < 1
      ? `At ${opacity.toFixed(2)} opacity it lets the layers beneath show through: alpha compositing in layer order, exactly the painter's algorithm blending back-to-front. `
      : "") +
    `Compare the z-fighting scene: 3D surfaces at the same depth fight because a z-buffer decides per pixel; this map never fights because there is nothing to decide — order IS visibility. ` +
    `That is the painter's algorithm, and its cost (sort everything, every frame, no interpenetration) is why the depth buffer was invented.`;

  return (
    <PlaygroundFrame
      title="Painter's order over Lake Zurich"
      caption={caption}
      onReset={() => {
        setTop(INITIAL.top);
        setOpacity(INITIAL.opacity);
        applyState(INITIAL.top, INITIAL.opacity);
      }}
      controls={
        <>
          <SegmentedControl
            label="Drawing order"
            options={ORDER_OPTIONS}
            value={top}
            onChange={handleOrderChange}
          />
          <SliderControl
            label="Top layer opacity"
            value={opacity}
            min={0.2}
            max={1}
            step={0.05}
            onInput={handleOpacityChange}
            format={(v) => v.toFixed(2)}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Painter&apos;s algorithm: draw back-to-front, so later paint covers earlier. It works
            perfectly for layered 2D like this map — order alone settles every overlap. It breaks on
            cyclic overlap and interpenetration in 3D, which the z-buffer solves per pixel, at the
            cost of the depth precision issues the z-fighting scene above shows.
          </p>
        </>
      }
    >
      <arcgis-map
        ref={mapRef}
        className="block h-full w-full"
        basemap="osm"
        center={CENTER_ATTR}
        zoom={ZOOM}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
    </PlaygroundFrame>
  );
}
