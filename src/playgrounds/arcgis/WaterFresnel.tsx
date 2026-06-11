import { useRef, useState } from "react";
import Camera from "@arcgis/core/Camera.js";
import Graphic from "@arcgis/core/Graphic.js";
import Polygon from "@arcgis/core/geometry/Polygon.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import PolygonSymbol3D from "@arcgis/core/symbols/PolygonSymbol3D.js";
import "@arcgis/map-components/components/arcgis-scene";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Fresnel in the wild: Lake Brienz rendered with the SDK's realistic water
 * (verified in @arcgis/core v5 typings, symbols/WaterSymbol3DLayer.d.ts — a
 * polygon symbolized with a PolygonSymbol3D containing a `type: "water"`
 * symbol layer; waveStrength is "calm" | "rippled" | "slight" | "moderate").
 * The engine's water shader uses the Fresnel equations, so the same surface
 * is a mountain mirror at grazing incidence and dark, almost transparent
 * water when viewed from straight above. Reflections need the scene's
 * qualityProfile set to "high" (runtime-settable accessor on the
 * arcgis-scene component, verified in customElement.d.ts).
 *
 * The water polygon is a generous hand-drawn rectangle at the lake's surface
 * altitude (~564 m); parts that overlap land are simply buried under the
 * terrain, so no external data is needed.
 *
 * Keyless services only: OSM basemap + Esri world elevation.
 */

/** Lake Brienz sits at ~564 m a.s.l.; render just above to avoid z-fighting. */
const WATER_Z = 564.3;
const WATER_LAYER_ID = "lake-brienz-water";

/** Generous rectangle over Lake Brienz (Interlaken → Brienz); land parts stay buried. */
const WATER_RINGS: number[][][] = [
  [
    [7.84, 46.67, WATER_Z],
    [8.09, 46.67, WATER_Z],
    [8.09, 46.78, WATER_Z],
    [7.84, 46.78, WATER_Z],
    [7.84, 46.67, WATER_Z],
  ],
];

type ViewAngle = "grazing" | "steep";
type WaveSetting = "calm" | "rippled" | "moderate";

const CAMERAS: Record<
  ViewAngle,
  { position: [number, number, number]; heading: number; tilt: number }
> = {
  // ~20 m above the water off Bönigen, looking ENE along the lake toward the
  // Brienzer Rothorn ridge — lots of mountain for the surface to reflect.
  grazing: { position: [7.895, 46.69, 585], heading: 59, tilt: 84 },
  // High above mid-lake, looking almost straight down.
  steep: { position: [7.96, 46.715, 5800], heading: 59, tilt: 8 },
};

const INITIAL = {
  angle: "grazing" as ViewAngle,
  waves: "rippled" as WaveSetting,
  atmosphere: true,
};

const makeWaterSymbol = (waves: WaveSetting): PolygonSymbol3D =>
  new PolygonSymbol3D({
    symbolLayers: [
      {
        type: "water",
        color: "#17616e", // Lake Brienz's signature turquoise, darkened
        waterbodySize: "medium",
        waveStrength: waves,
      },
    ],
  });

export default function WaterFresnel(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const waterGraphicRef = useRef<Graphic | null>(null);
  const [angle, setAngle] = useState<ViewAngle>(INITIAL.angle);
  const [waves, setWaves] = useState<WaveSetting>(INITIAL.waves);
  const [atmosphere, setAtmosphere] = useState(INITIAL.atmosphere);

  /** True once the view exists; all imperative access goes through this. */
  const readyScene = (): HTMLArcgisSceneElement | null => {
    const el = sceneRef.current;
    return el && el.view ? el : null;
  };

  const applyWaves = (w: WaveSetting): void => {
    const graphic = waterGraphicRef.current;
    if (graphic) graphic.symbol = makeWaterSymbol(w);
  };

  const goToAngle = (el: HTMLArcgisSceneElement, a: ViewAngle): void => {
    const { position, heading, tilt } = CAMERAS[a];
    const [longitude, latitude, z] = position;
    void el
      .goTo(new Camera({ position: { longitude, latitude, z }, heading, tilt }))
      .catch(() => undefined); // interrupted animations reject — never crash on that
  };

  const handleViewReady = (event: { target: HTMLArcgisSceneElement }): void => {
    const el = event.target;
    // StrictMode double-mounts and basemap changes can re-fire this; add once.
    if (el.map && !el.map.findLayerById(WATER_LAYER_ID)) {
      const water = new Graphic({
        geometry: new Polygon({ rings: WATER_RINGS }),
        symbol: makeWaterSymbol(waves),
      });
      el.map.add(
        new GraphicsLayer({
          id: WATER_LAYER_ID,
          title: "Lake Brienz water",
          elevationInfo: { mode: "absolute-height" },
          graphics: [water],
        }),
      );
    }
    const layer = el.map?.findLayerById(WATER_LAYER_ID);
    if (layer instanceof GraphicsLayer) waterGraphicRef.current = layer.graphics.at(0) ?? null;
    el.environment.atmosphereEnabled = atmosphere;
  };

  const waveNote =
    waves === "calm"
      ? "On calm water the reflection is crisp."
      : waves === "rippled"
        ? "Ripples tilt the micro-surface, smearing the reflection."
        : "Choppy waves scatter the reflection into glittering fragments.";

  const caption =
    angle === "grazing"
      ? `Skimming the surface, your view ray hits the water at grazing incidence — Fresnel says reflectance climbs toward 100%, so the lake becomes a mirror for the far shore. ${waveNote}`
      : `From up here you look almost straight down: Fresnel reflectance falls to ~2% at normal incidence, so the lake reads see-through-dark instead of mirror-bright. Glide back to the grazing preset and it becomes a mirror — that's Fresnel. ${waveNote}`;

  return (
    <PlaygroundFrame
      title="Fresnel on Lake Brienz"
      caption={caption}
      onReset={() => {
        setAngle(INITIAL.angle);
        setWaves(INITIAL.waves);
        setAtmosphere(INITIAL.atmosphere);
        applyWaves(INITIAL.waves);
        const el = readyScene();
        if (!el) return;
        el.environment.atmosphereEnabled = INITIAL.atmosphere;
        goToAngle(el, INITIAL.angle);
      }}
      controls={
        <>
          <SegmentedControl<ViewAngle>
            label="View angle"
            value={angle}
            options={[
              { value: "grazing", label: "Grazing" },
              { value: "steep", label: "Steep" },
            ]}
            onChange={(a) => {
              setAngle(a);
              const el = readyScene();
              if (el) goToAngle(el, a);
            }}
          />
          <SegmentedControl<WaveSetting>
            label="Wave strength"
            value={waves}
            options={[
              { value: "calm", label: "Calm" },
              { value: "rippled", label: "Rippled" },
              { value: "moderate", label: "Choppy" },
            ]}
            onChange={(w) => {
              setWaves(w);
              applyWaves(w);
            }}
          />
          <SwitchControl
            label="Atmosphere"
            checked={atmosphere}
            onChange={(on) => {
              setAtmosphere(on);
              const el = readyScene();
              if (el) el.environment.atmosphereEnabled = on;
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Drag the camera low along the water and watch the far shore's reflection strengthen as
            your view flattens out. Water reflections need the scene's high quality profile, which
            this demo sets.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="osm"
        ground="world-elevation"
        qualityProfile="high"
        cameraPosition="7.8950, 46.6900, 585"
        cameraHeading={CAMERAS.grazing.heading}
        cameraTilt={CAMERAS.grazing.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
    </PlaygroundFrame>
  );
}
