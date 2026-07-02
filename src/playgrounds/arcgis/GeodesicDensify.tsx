import { useRef, useState } from "react";
import Camera from "@arcgis/core/Camera.js";
import Graphic from "@arcgis/core/Graphic.js";
import Point from "@arcgis/core/geometry/Point.js";
import Polyline from "@arcgis/core/geometry/Polyline.js";
import * as geodeticDensifyOperator from "@arcgis/core/geometry/operators/geodeticDensifyOperator.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import IconSymbol3DLayer from "@arcgis/core/symbols/IconSymbol3DLayer.js";
import LineSymbol3D from "@arcgis/core/symbols/LineSymbol3D.js";
import LineSymbol3DLayer from "@arcgis/core/symbols/LineSymbol3DLayer.js";
import PointSymbol3D from "@arcgis/core/symbols/PointSymbol3D.js";
import "@arcgis/map-components/components/arcgis-scene";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl, SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Tessellation, stripped to one idea: curves don't exist. The engine only ever
 * draws straight 3D chords between a polyline's vertices, so a two-point "great
 * circle" from Zurich to New York is a single chord that slices *through* the
 * planet. `geodeticDensifyOperator.execute` inserts intermediate vertices along
 * the true geodesic; as the max segment length shrinks, the chords get short
 * enough to hug the surface and the line finally reads as the arc pilots fly.
 *
 * Same trade-off as the subdivision slider in the displacement demo and as
 * terrain LOD tiles: more vertices → smoother curve → more work per frame.
 */

const LAYER_ID = "geodesic-densify-line";

/**
 * The path floats at cruise-of-the-gods altitude: with z = 0 every coarse chord
 * is buried inside the planet and nothing shows but the endpoint dots. At
 * 200 km the fine arc reads clearly above the globe, chords at 2,500 km sag
 * visibly toward the surface (sagitta ≈ 120 km), and the 5,000 km chords
 * (sagitta ≈ 480 km) still plunge straight through the Atlantic — the lesson,
 * now visible instead of hidden underground. The layer is absolute-height so
 * every chord is literal 3D geometry.
 */
const PATH_ALTITUDE = 200_000;
const ZURICH: [number, number, number] = [8.54, 47.37, PATH_ALTITUDE];
const NEW_YORK: [number, number, number] = [-74.0, 40.71, PATH_ALTITUDE];

/** Great-circle Zurich→JFK ≈ 6,330 km; used only for the expected-count note. */
const GEODESIC_KM = 6330;

/** Slider index → max segment length in metres. Coarse (left) to fine (right). */
const SEGMENT_METERS = [5_000_000, 2_500_000, 1_000_000, 500_000, 250_000, 100_000, 50_000];
const DEFAULT_INDEX = 1;

/** Drawing thousands of point graphics stutters; the readout still shows the true count. */
const MAX_DOTS = 500;

const HOT_MAGENTA = "#e11d48";

type CameraPreset = "space" | "surface";

const CAMERAS: Record<
  CameraPreset,
  { position: [number, number, number]; heading: number; tilt: number }
> = {
  // High over the Atlantic so both cities and the whole arc sit in frame.
  space: { position: [-30, 45, 9_000_000], heading: 0, tilt: 0 },
  // Low behind Zurich, looking northwest along the path — the chord dives underground.
  surface: { position: [11, 46.2, 350_000], heading: 312, tilt: 88 },
};

const nf = new Intl.NumberFormat("en-US");
const formatKm = (index: number): string => `${nf.format(SEGMENT_METERS[index] / 1000)} km`;

/** The two-vertex chord that cuts through the earth before any densification. */
const baseLine = (): Polyline =>
  new Polyline({
    hasZ: true,
    spatialReference: { wkid: 4326 },
    paths: [[ZURICH, NEW_YORK]],
  });

const lineSymbol = (): LineSymbol3D =>
  new LineSymbol3D({
    symbolLayers: [new LineSymbol3DLayer({ size: 3, material: { color: HOT_MAGENTA } })],
  });

const dotSymbol = (): PointSymbol3D =>
  new PointSymbol3D({
    symbolLayers: [
      new IconSymbol3DLayer({
        size: 6,
        resource: { primitive: "circle" },
        material: { color: "#ffffff" },
        outline: { color: HOT_MAGENTA, size: 1 },
      }),
    ],
  });

const countVertices = (line: Polyline): number =>
  line.paths.reduce((sum, path) => sum + path.length, 0);

/** ceil(distance / segment) + 1, the vertex count a uniform densify produces. */
const expectedVertices = (index: number): number =>
  Math.ceil((GEODESIC_KM * 1000) / SEGMENT_METERS[index]) + 1;

export default function GeodesicDensify(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const [index, setIndex] = useState(DEFAULT_INDEX);
  const [showVertices, setShowVertices] = useState(true);
  const [preset, setPreset] = useState<CameraPreset>("space");
  const [vertexCount, setVertexCount] = useState(expectedVertices(DEFAULT_INDEX));

  /** True once the view exists; all imperative access goes through this. */
  const readyScene = (): HTMLArcgisSceneElement | null => {
    const el = sceneRef.current;
    return el && el.view ? el : null;
  };

  const layerOf = (el: HTMLArcgisSceneElement): GraphicsLayer | null => {
    const layer = el.map?.findLayerById(LAYER_ID);
    return layer instanceof GraphicsLayer ? layer : null;
  };

  /** Densify the base chord to the current segment length, redraw line + dots, count vertices. */
  const rebuild = (el: HTMLArcgisSceneElement, i: number, dots: boolean): void => {
    const layer = layerOf(el);
    if (!layer || layer.destroyed) return;
    const densified = geodeticDensifyOperator.execute(baseLine(), SEGMENT_METERS[i]);
    const raw = densified instanceof Polyline ? densified : baseLine();
    // Densify interpolates z linearly along each chord; pin every vertex back
    // to the display altitude so only the CHORDS between vertices sag, which
    // is exactly the straightness we want to expose.
    const line = new Polyline({
      hasZ: true,
      spatialReference: raw.spatialReference,
      paths: raw.paths.map((path) => path.map(([x, y]) => [x, y, PATH_ALTITUDE])),
    });

    layer.removeAll();
    layer.add(new Graphic({ geometry: line, symbol: lineSymbol() }));

    const count = countVertices(line);
    if (dots) {
      const points = line.paths.flat().slice(0, MAX_DOTS);
      const symbol = dotSymbol();
      for (const [longitude, latitude, z] of points) {
        layer.add(
          new Graphic({
            geometry: new Point({ longitude, latitude, z, hasZ: true }),
            symbol,
          }),
        );
      }
    }
    setVertexCount(count);
  };

  const goToPreset = (el: HTMLArcgisSceneElement, p: CameraPreset): void => {
    const { position, heading, tilt } = CAMERAS[p];
    const [longitude, latitude, z] = position;
    void el
      .goTo(new Camera({ position: { longitude, latitude, z }, heading, tilt }))
      .catch(() => undefined); // interrupted animations reject — never crash on that
  };

  const handleViewReady = (event: { target: HTMLArcgisSceneElement }): void => {
    const el = event.target;
    // StrictMode double-mounts can re-fire this; add the layer only once.
    if (el.map && !el.map.findLayerById(LAYER_ID)) {
      const layer = new GraphicsLayer({
        id: LAYER_ID,
        listMode: "hide",
        elevationInfo: { mode: "absolute-height" },
      });
      el.map.add(layer);
      void (async () => {
        if (!geodeticDensifyOperator.isLoaded()) await geodeticDensifyOperator.load();
        // The view may have been torn down (StrictMode) while the module loaded.
        if (!el.view || layer.destroyed) return;
        rebuild(el, index, showVertices);
      })();
    }
  };

  const caption = `Max segment ${formatKm(index)} → ${nf.format(vertexCount)} ${
    vertexCount === 1 ? "vertex" : "vertices"
  }: the magenta "curve" is really that many straight 3D chords between vertices pinned 200 km up. At the coarsest setting the chords plunge straight through the Atlantic; densify and they sag less and less until the line reads as the great-circle arc pilots actually fly. Tessellation is exactly this trade — more vertices, smoother curve, more work per frame.`;

  return (
    <PlaygroundFrame
      title="A straight flight path that cuts through the Earth: Zurich → New York"
      caption={caption}
      onReset={() => {
        setIndex(DEFAULT_INDEX);
        setShowVertices(true);
        setPreset("space");
        const el = readyScene();
        if (!el) return;
        rebuild(el, DEFAULT_INDEX, true);
        goToPreset(el, "space");
      }}
      controls={
        <>
          <SliderControl
            label="Max segment length"
            value={index}
            min={0}
            max={SEGMENT_METERS.length - 1}
            step={1}
            format={formatKm}
            onInput={(v) => {
              const i = Math.round(v);
              setIndex(i);
              const el = readyScene();
              if (el) rebuild(el, i, showVertices);
            }}
          />
          <SwitchControl
            label="Show vertices"
            checked={showVertices}
            onChange={(checked) => {
              setShowVertices(checked);
              const el = readyScene();
              if (el) rebuild(el, index, checked);
            }}
          />
          <SegmentedControl<CameraPreset>
            label="Camera"
            value={preset}
            options={[
              { value: "space", label: "From space" },
              { value: "surface", label: "Surface" },
            ]}
            onChange={(p) => {
              setPreset(p);
              const el = readyScene();
              if (el) goToPreset(el, p);
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Everything the GPU draws is straight: line segments and flat triangles. A curve is just
            enough short segments that the straightness stops being visible — tessellation. It is
            the same knob as the subdivision slider in the displacement demo and the LOD levels of
            terrain tiles: subdivide until it looks smooth, and pay for every extra vertex.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="satellite"
        ground="world-elevation"
        cameraPosition="-30, 45, 9000000"
        cameraHeading={CAMERAS.space.heading}
        cameraTilt={CAMERAS.space.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
    </PlaygroundFrame>
  );
}
