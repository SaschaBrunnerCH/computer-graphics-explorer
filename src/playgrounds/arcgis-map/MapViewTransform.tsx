import { useRef, useState } from "react";
import Graphic from "@arcgis/core/Graphic.js";
import Point from "@arcgis/core/geometry/Point.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol.js";
import TextSymbol from "@arcgis/core/symbols/TextSymbol.js";
import "@arcgis/map-components/components/arcgis-map";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * The *V* of MVP, made tangible on a real MapView. MeshTransform (the 3D box)
 * drives the *Model* matrix — it moves the world. This one drives the *View*
 * matrix: rotating and zooming the map moves the CAMERA, not the world. A
 * handful of fixed, labelled Zurich landmarks sit in a GraphicsLayer with a
 * bold star at the centre, so it stays obvious that the world holds still
 * while the view spins around it.
 *
 * The controls set two runtime view properties directly (the responsive path —
 * `goTo` would animate and lag the slider): `view.rotation` (degrees; the SDK
 * defines it as the clockwise rotation of due north relative to the top of the
 * view) and `view.zoom`. Continuous zoom needs `constraints.snapToZoom = false`.
 *
 * The matrix readout is honest arithmetic, not an engine dump: from the same
 * rotation and zoom the sliders publish, we build the world→screen rotation
 * and scale that V encodes, in 2D homogeneous form. The scale is shown relative
 * to the start zoom (2^(zoom − 13)) so it reads as a clean number rather than a
 * pixels-per-metre giant; the translation column tracks the centre, which this
 * demo never moves, so it is labelled rather than dumped as coordinates.
 *
 * Keyless by construction: the "osm" raster basemap, no API key required. The
 * basemap must be set at creation — the element only builds its view once it
 * has a map, so a later swap would come too late.
 */

const LAYER_ID = "view-transform-markers";

/** Zurich centre — the fixed point everything rotates around. */
const CENTER: [number, number] = [8.5417, 47.3769];
const CENTER_ATTR = `${CENTER[0]}, ${CENTER[1]}`;

/** Zoom at which the illustrative view scale equals 1 (the start zoom). */
const REFERENCE_ZOOM = 13;

const ROTATION = { min: 0, max: 360, step: 5 };
const ZOOM = { min: 11, max: 16, step: 0.25 };
const INITIAL = { rotation: 0, zoom: 13 };

/** Fixed landmarks so a spin reads as "the world stayed put, the view turned". */
const SPOTS: readonly { lon: number; lat: number; label: string }[] = [
  { lon: 8.5402, lat: 47.3779, label: "Zürich HB" },
  { lon: 8.5476, lat: 47.3763, label: "ETH" },
  { lon: 8.5439, lat: 47.3701, label: "Grossmünster" },
  { lon: 8.541, lat: 47.3661, label: "Bürkliplatz" },
];

/** The world's fixed markers + labels, plus a bold star at the rotation centre. */
function buildGraphics(): Graphic[] {
  const graphics: Graphic[] = [];
  for (const spot of SPOTS) {
    graphics.push(
      new Graphic({
        geometry: new Point({ longitude: spot.lon, latitude: spot.lat }),
        symbol: new SimpleMarkerSymbol({
          style: "circle",
          size: 10,
          color: [37, 99, 235, 0.9],
          outline: { color: [255, 255, 255, 0.9], width: 1.5 },
        }),
      }),
      new Graphic({
        geometry: new Point({ longitude: spot.lon, latitude: spot.lat }),
        symbol: new TextSymbol({
          text: spot.label,
          color: [15, 23, 42, 0.95],
          haloColor: [255, 255, 255, 0.9],
          haloSize: 1.5,
          yoffset: 10,
          font: { size: 11, weight: "bold" },
        }),
      }),
    );
  }
  graphics.push(
    new Graphic({
      geometry: new Point({ longitude: CENTER[0], latitude: CENTER[1] }),
      symbol: new SimpleMarkerSymbol({
        style: "cross",
        size: 20,
        color: [220, 38, 38, 1],
        outline: { color: [220, 38, 38, 1], width: 3 },
      }),
    }),
  );
  return graphics;
}

/** Format a number to 3 decimals, right-aligned in a fixed-width cell. */
const cell = (n: number): string => n.toFixed(3).padStart(7);

/**
 * The world→screen rotation+scale that V encodes, printed as a 3×3 homogeneous
 * matrix. Derived purely from the sliders' rotation and zoom — our arithmetic,
 * not an engine read. Scale is relative to the start zoom so it stays legible.
 */
function viewMatrixText(rotationDeg: number, zoom: number): string {
  const theta = (rotationDeg * Math.PI) / 180;
  const s = Math.pow(2, zoom - REFERENCE_ZOOM);
  const a = s * Math.cos(theta);
  const b = -s * Math.sin(theta);
  const c = s * Math.sin(theta);
  const d = s * Math.cos(theta);
  return [
    `⎡ ${cell(a)}  ${cell(b)}     tx ⎤`,
    `⎢ ${cell(c)}  ${cell(d)}     ty ⎥`,
    `⎣ ${cell(0)}  ${cell(0)}  ${cell(1)} ⎦`,
    ``,
    `s = ${s.toFixed(3)}  ( 2^(zoom − ${REFERENCE_ZOOM}) )`,
    `θ = ${Math.round(rotationDeg)}°`,
    `tx, ty ← −(R·S)·center  (Zurich stays fixed)`,
  ].join("\n");
}

export default function MapViewTransform(): React.JSX.Element {
  const mapRef = useRef<HTMLArcgisMapElement | null>(null);
  const [rotation, setRotation] = useState(INITIAL.rotation);
  const [zoom, setZoom] = useState(INITIAL.zoom);

  /** True once the view exists; all imperative access goes through this. */
  const readyMap = (): HTMLArcgisMapElement | null => {
    const el = mapRef.current;
    return el && el.view ? el : null;
  };

  const handleViewReady = (event: { target: HTMLArcgisMapElement }): void => {
    const el = event.target;
    // Continuous zoom needs snapping off, or view.zoom would jump to integers.
    el.view.constraints.snapToZoom = false;
    // StrictMode double-mounts can re-fire this; add the layer only once.
    if (el.map && !el.map.findLayerById(LAYER_ID)) {
      el.map.add(new GraphicsLayer({ id: LAYER_ID, graphics: buildGraphics() }));
    }
  };

  const applyRotation = (value: number): void => {
    setRotation(value);
    const el = readyMap();
    if (el) el.view.rotation = value;
  };

  const applyZoom = (value: number): void => {
    setZoom(value);
    const el = readyMap();
    if (el) el.view.zoom = value;
  };

  const matrixText = viewMatrixText(rotation, zoom);

  const caption = `Rotation ${Math.round(rotation)}°, zoom ${zoom.toFixed(
    2,
  )} — you never moved Zurich; you moved the camera. The view matrix is the world-to-screen half of MVP: the same numbers as rotating the world the other way, which is why V is "just another matrix, inverted". The 3D box demo above drives M; this drives V.`;

  return (
    <PlaygroundFrame
      title="View transforms over Zurich"
      caption={caption}
      onReset={() => {
        setRotation(INITIAL.rotation);
        setZoom(INITIAL.zoom);
        const el = readyMap();
        if (!el) return;
        el.view.rotation = INITIAL.rotation;
        el.view.zoom = INITIAL.zoom;
        el.view.center = new Point({ longitude: CENTER[0], latitude: CENTER[1] });
      }}
      controls={
        <>
          <SliderControl
            label="View rotation"
            value={rotation}
            min={ROTATION.min}
            max={ROTATION.max}
            step={ROTATION.step}
            format={(v) => `${Math.round(v)}°`}
            onInput={applyRotation}
          />
          <SliderControl
            label="Zoom (scale)"
            value={zoom}
            min={ZOOM.min}
            max={ZOOM.max}
            step={ZOOM.step}
            format={(v) => v.toFixed(2)}
            onInput={applyZoom}
          />
          <div className="flex flex-col gap-1">
            <span className="text-xs text-[var(--calcite-color-text-3)]">
              the view transform this maps to (illustration — our arithmetic from the view&apos;s
              public rotation/scale, not an engine dump)
            </span>
            <pre className="m-0 overflow-x-auto rounded bg-[var(--calcite-color-foreground-2)] p-2 font-mono text-[11px] leading-tight text-[var(--calcite-color-text-2)]">
              {matrixText}
            </pre>
          </div>
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            MVP = <strong>Model</strong> (place the object) · <strong>View</strong> (place the
            camera) · <strong>Projection</strong> (flatten to screen). A 2D map&apos;s V is a
            rotation + scale + translation — small enough to print, which is the point.
          </p>
        </>
      }
    >
      <arcgis-map
        ref={mapRef}
        className="block h-full w-full"
        basemap="osm"
        center={CENTER_ATTR}
        zoom={INITIAL.zoom}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
    </PlaygroundFrame>
  );
}
