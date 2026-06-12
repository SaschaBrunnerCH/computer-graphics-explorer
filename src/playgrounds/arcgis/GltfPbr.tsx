import { useRef, useState } from "react";
import Camera from "@arcgis/core/Camera.js";
import Graphic from "@arcgis/core/Graphic.js";
import Mesh from "@arcgis/core/geometry/Mesh.js";
import Point from "@arcgis/core/geometry/Point.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import FillSymbol3DLayer from "@arcgis/core/symbols/FillSymbol3DLayer.js";
import MeshSymbol3D from "@arcgis/core/symbols/MeshSymbol3D.js";
import "@arcgis/map-components/components/arcgis-scene";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * A real glTF asset inside an ArcGIS scene: the Khronos "WaterBottle" sample
 * model (CC0 1.0, © 2017 Microsoft; textures resized to 512px → 632 kB,
 * committed under public/models/) is loaded with `Mesh.createFromGLTF`
 * (verified in @arcgis/core v5 typings: (location, url, params) → Promise<Mesh>)
 * and placed as an oversized art installation on Sechseläutenplatz in Zurich.
 *
 * Its metallic-roughness textures — metal cap, glossy dielectric body, matte
 * label — are shaded by the engine's PBR pipeline under the *real sun*: the
 * time-of-day slider moves `environment.lighting.date` (SunLighting, same
 * approach as the Shadows playground), so the highlights, Fresnel rim and
 * shadows all respond together.
 */

const MODEL_URL = `${import.meta.env.BASE_URL}models/water-bottle.glb`;
const MODEL_LAYER_ID = "gltf-water-bottle";

/** Sechseläutenplatz — the big open plaza by the Zurich opera house. */
const MODEL_LON = 8.5453;
const MODEL_LAT = 47.3655;
/** Used if the elevation query fails; the plaza sits at ~406 m. */
const FALLBACK_GROUND_Z = 406;
/** The bottle is 0.26 m tall — ×30 makes an 8 m sculpture. */
const MODEL_SCALE = 30;
/** Half the bottle's height after scaling (its origin is at its center). */
const FALLBACK_LIFT = 0.1302 * MODEL_SCALE;

type CameraPreset = "close" | "context";

const CAMERAS: Record<
  CameraPreset,
  { position: [number, number, number]; heading: number; tilt: number }
> = {
  // Eye-level on the plaza, the bottle filling the frame.
  close: { position: [8.5451, 47.3652, 417], heading: 27, tilt: 82 },
  // From over the lake shore — opera house, plaza and bottle in context.
  context: { position: [8.5495, 47.3618, 650], heading: 320, tilt: 65 },
};

/** Local Zurich hour (UTC+2 in June) → Date for the sun position. */
const dateForHour = (hour: number): Date =>
  new Date(Date.UTC(2026, 5, 21, 0, Math.round(hour * 60) - 120));

const formatHour = (hour: number): string => {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const INITIAL = { hour: 16, preset: "close" as CameraPreset };

type LoadStatus = "loading" | "ready" | "failed";

export default function GltfPbr(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const [hour, setHour] = useState(INITIAL.hour);
  const [preset, setPreset] = useState<CameraPreset>(INITIAL.preset);
  const [status, setStatus] = useState<LoadStatus>("loading");

  /** True once the view exists; all imperative access goes through this. */
  const readyScene = (): HTMLArcgisSceneElement | null => {
    const el = sceneRef.current;
    return el && el.view ? el : null;
  };

  const applySun = (el: HTMLArcgisSceneElement, h: number): void => {
    const lighting = el.environment.lighting;
    if (lighting.type === "sun") lighting.date = dateForHour(h);
  };

  const goToPreset = (el: HTMLArcgisSceneElement, p: CameraPreset): void => {
    const { position, heading, tilt } = CAMERAS[p];
    const [longitude, latitude, z] = position;
    void el
      .goTo(new Camera({ position: { longitude, latitude, z }, heading, tilt }))
      .catch(() => undefined); // interrupted animations reject — never crash on that
  };

  /** Load the GLB, scale it, set it down on the plaza, add it as a graphic. */
  const addModel = async (el: HTMLArcgisSceneElement, layer: GraphicsLayer): Promise<void> => {
    let groundZ = FALLBACK_GROUND_Z;
    const ground = el.map?.ground;
    if (ground) {
      try {
        const query = await ground.queryElevation(
          new Point({ longitude: MODEL_LON, latitude: MODEL_LAT }),
        );
        groundZ = query.geometry.z ?? FALLBACK_GROUND_Z;
      } catch {
        // keep the fallback elevation
      }
    }
    const origin = new Point({ longitude: MODEL_LON, latitude: MODEL_LAT, z: groundZ });
    const mesh = await Mesh.createFromGLTF(origin, MODEL_URL, { vertexSpace: "local" });
    mesh.scale(MODEL_SCALE, { origin });
    // The bottle's origin is at its center — lift it so the base touches ground.
    const zmin = mesh.extent?.zmin;
    mesh.offset(0, 0, zmin != null && Number.isFinite(zmin) ? groundZ - zmin : FALLBACK_LIFT);
    // The view may have been torn down (StrictMode) while we were loading.
    if (!el.view || layer.destroyed) return;
    if (layer.graphics.length === 0) {
      layer.add(
        new Graphic({
          geometry: mesh,
          // An empty fill layer keeps the glTF's own PBR textures untinted.
          symbol: new MeshSymbol3D({ symbolLayers: [new FillSymbol3DLayer()] }),
        }),
      );
    }
    setStatus("ready");
  };

  const handleViewReady = (event: { target: HTMLArcgisSceneElement }): void => {
    const el = event.target;
    el.environment.lighting = {
      type: "sun",
      date: dateForHour(hour),
      directShadowsEnabled: true,
    };
    // StrictMode double-mounts can re-fire this; add the layer only once.
    if (el.map && !el.map.findLayerById(MODEL_LAYER_ID)) {
      const layer = new GraphicsLayer({
        id: MODEL_LAYER_ID,
        listMode: "hide",
        elevationInfo: { mode: "absolute-height" },
      });
      el.map.add(layer);
      void addModel(el, layer).catch(() => setStatus("failed"));
    }
  };

  const caption =
    status === "failed"
      ? "The glTF model failed to load — reload the page to retry. The scene itself still shades everything with the same PBR pipeline."
      : `${status === "loading" ? "Loading the glTF model… " : ""}Sun at ${formatHour(hour)}. The 8 m bottle is a real glTF asset (Khronos sample, CC0) carrying metalness/roughness textures — the same two inputs as the sphere grid above, but painted per-pixel: a metal cap with tinted reflections, a smooth glossy body, a matte paper label. Move the sun and watch all three respond differently to the same light.`;

  return (
    <PlaygroundFrame
      title="A glTF water bottle on Sechseläutenplatz, Zurich"
      caption={caption}
      onReset={() => {
        setHour(INITIAL.hour);
        setPreset(INITIAL.preset);
        const el = readyScene();
        if (!el) return;
        el.environment.lighting = {
          type: "sun",
          date: dateForHour(INITIAL.hour),
          directShadowsEnabled: true,
        };
        goToPreset(el, INITIAL.preset);
      }}
      controls={
        <>
          <SliderControl
            label="Sun time of day"
            value={hour}
            min={6}
            max={21}
            step={0.25}
            format={formatHour}
            onInput={(h) => {
              setHour(h);
              const el = readyScene();
              if (el) applySun(el, h);
            }}
          />
          <SegmentedControl<CameraPreset>
            label="Camera"
            value={preset}
            options={[
              { value: "close", label: "Close orbit" },
              { value: "context", label: "Context" },
            ]}
            onChange={(p) => {
              setPreset(p);
              const el = readyScene();
              if (el) goToPreset(el, p);
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            At low sun (morning/evening) look for the Fresnel rim on the bottle's silhouette and the
            long shadow anchoring it to the plaza; at noon the metal cap's highlight tightens. Drag
            to orbit — reflections slide across the surface as your view direction changes.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="osm"
        ground="world-elevation"
        cameraPosition="8.5451, 47.3652, 417"
        cameraHeading={CAMERAS.close.heading}
        cameraTilt={CAMERAS.close.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
    </PlaygroundFrame>
  );
}
