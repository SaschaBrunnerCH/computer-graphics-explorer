import { useRef, useState } from "react";
import SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import SimpleRenderer from "@arcgis/core/renderers/SimpleRenderer.js";
import FillSymbol3DLayer from "@arcgis/core/symbols/FillSymbol3DLayer.js";
import MeshSymbol3D from "@arcgis/core/symbols/MeshSymbol3D.js";
import SketchEdges3D from "@arcgis/core/symbols/edges/SketchEdges3D.js";
import SolidEdges3D from "@arcgis/core/symbols/edges/SolidEdges3D.js";
import "@arcgis/map-components/components/arcgis-scene";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl, SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Edge rendering on Zurich's buildings: a renderer-driven outline pass —
 * ArcGIS's signature NPR/sketch style that restores the depth cues
 * untextured models lose.
 *
 * v5 API (verified in @arcgis/core typings): SimpleRenderer → MeshSymbol3D →
 * FillSymbol3DLayer with `edges` (SolidEdges3D / SketchEdges3D from
 * symbols/edges/, properties color/size/extensionLength) and `material`
 * ({ color, colorMixMode: "replace" } paints facades flat white). The
 * renderer setter does NOT accept null, so "None" applies an empty
 * FillSymbol3DLayer (no material override, no edges) instead of unsetting.
 *
 * Keyless services only (verified): OSM basemap, world elevation, and the
 * public OSM 3D buildings SceneServer — which accepts custom renderers.
 */

const OSM_BUILDINGS_URL =
  "https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer";
const OSM_BUILDINGS_ID = "osm-3d-buildings";

/** Low over Zurich's old town, tilted so rooflines and facades stack in depth. */
const CAMERA = { position: "8.5410, 47.3700, 550", heading: 20, tilt: 75 };

type EdgeMode = "none" | "solid" | "sketch";

const INITIAL = { mode: "solid" as EdgeMode, size: 1, white: true };

const makeRenderer = (mode: EdgeMode, size: number, white: boolean): SimpleRenderer => {
  const edges =
    mode === "solid"
      ? new SolidEdges3D({ size, color: [40, 40, 40, 0.8] })
      : mode === "sketch"
        ? new SketchEdges3D({ size, color: [30, 30, 30, 0.85] })
        : null;
  return new SimpleRenderer({
    symbol: new MeshSymbol3D({
      symbolLayers: [
        new FillSymbol3DLayer({
          // "replace" discards the source colors entirely → flat white shells.
          material: white ? { color: "white", colorMixMode: "replace" } : null,
          edges,
        }),
      ],
    }),
  });
};

export default function EdgeRendering(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  const [mode, setMode] = useState<EdgeMode>(INITIAL.mode);
  const [size, setSize] = useState(INITIAL.size);
  const [white, setWhite] = useState(INITIAL.white);

  /** True once the view exists; all imperative access goes through this. */
  const readyScene = (): HTMLArcgisSceneElement | null => {
    const el = sceneRef.current;
    return el && el.view ? el : null;
  };

  const applyRenderer = (el: HTMLArcgisSceneElement, m: EdgeMode, s: number, w: boolean): void => {
    const layer = el.map?.findLayerById(OSM_BUILDINGS_ID);
    if (layer instanceof SceneLayer) layer.renderer = makeRenderer(m, s, w);
  };

  const handleViewReady = (event: { target: HTMLArcgisSceneElement }): void => {
    const el = event.target;
    // StrictMode double-mounts can re-fire this; add the layer only once.
    if (el.map && !el.map.findLayerById(OSM_BUILDINGS_ID)) {
      el.map.add(
        new SceneLayer({
          id: OSM_BUILDINGS_ID,
          url: OSM_BUILDINGS_URL,
          title: "OSM 3D Buildings",
          renderer: makeRenderer(mode, size, white),
        }),
      );
    }
  };

  const caption =
    mode === "solid"
      ? `Solid edges, ${size.toFixed(1)} px: the renderer extracts each building's contour lines and strokes them on top of the shaded mesh — an outline pass that keeps ${white ? "the flat-white shells" : "the buildings"} readable where shading alone goes mushy.`
      : mode === "sketch"
        ? `Sketch edges, ${size.toFixed(1)} px: the same contours drawn with hand-sketched jitter and overshoot — ArcGIS's signature non-photorealistic style for unbuilt or schematic models. ${white ? "On white shells the linework carries the entire shape reading." : "Try white buildings — sketch lines shine on blank shells."}`
        : `No edges: ${white ? "flat-white" : "untextured"} volumes melt together — where one roof ends and the next begins is genuinely hard to tell. Turn edges on and the silhouettes snap back; that depth cue is what edge rendering exists for.`;

  return (
    <PlaygroundFrame
      title="Edge rendering on Zurich's buildings"
      caption={caption}
      onReset={() => {
        window.clearTimeout(debounceRef.current);
        setMode(INITIAL.mode);
        setSize(INITIAL.size);
        setWhite(INITIAL.white);
        const el = readyScene();
        if (el) applyRenderer(el, INITIAL.mode, INITIAL.size, INITIAL.white);
      }}
      controls={
        <>
          <SegmentedControl<EdgeMode>
            label="Edges"
            value={mode}
            options={[
              { value: "none", label: "None" },
              { value: "solid", label: "Solid" },
              { value: "sketch", label: "Sketch" },
            ]}
            onChange={(m) => {
              setMode(m);
              const el = readyScene();
              if (el) applyRenderer(el, m, size, white);
            }}
          />
          {mode !== "none" && (
            <SliderControl
              label="Edge size"
              value={size}
              min={0.5}
              max={3}
              step={0.25}
              format={(v) => `${v.toFixed(2)} px`}
              onInput={(v) => {
                setSize(v);
                // Each change re-symbolizes the whole layer; debounce drags.
                window.clearTimeout(debounceRef.current);
                debounceRef.current = window.setTimeout(() => {
                  const el = readyScene();
                  if (el) applyRenderer(el, mode, v, white);
                }, 200);
              }}
            />
          )}
          <SwitchControl
            label="White buildings"
            checked={white}
            onChange={(w) => {
              setWhite(w);
              const el = readyScene();
              if (el) applyRenderer(el, mode, size, w);
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Edges are part of the symbol, not a post-process you tune per frame: the renderer's fill
            symbol layer carries an edges component (solid or sketch) with color and size, and the
            engine extracts the contours from the mesh.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="osm"
        ground="world-elevation"
        cameraPosition={CAMERA.position}
        cameraHeading={CAMERA.heading}
        cameraTilt={CAMERA.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
    </PlaygroundFrame>
  );
}
