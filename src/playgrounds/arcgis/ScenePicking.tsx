import { useEffect, useRef, useState } from "react";
import Camera from "@arcgis/core/Camera.js";
import Graphic from "@arcgis/core/Graphic.js";
import Point from "@arcgis/core/geometry/Point.js";
import Polyline from "@arcgis/core/geometry/Polyline.js";
import SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import LineSymbol3D from "@arcgis/core/symbols/LineSymbol3D.js";
import PointSymbol3D from "@arcgis/core/symbols/PointSymbol3D.js";
import type { ClickEvent } from "@arcgis/core/views/input/types.js";
import "@arcgis/map-components/components/arcgis-scene";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Ray casting in the wild: every click calls `view.hitTest`, which shoots one
 * ray from the camera through the clicked pixel into the Zurich scene and
 * returns the first thing it intersects (a building from the OSM 3D buildings
 * SceneLayer, or the terrain). We highlight the hit building (verified:
 * SceneLayerView.highlight in v5 typings), drop a marker sphere at the hit
 * point, and draw the camera→hit ray as a 3D polyline. v5 hitTest results
 * carry the camera distance directly (HitExtension.distance, meters).
 *
 * Keyless services only (verified): OSM basemap, Esri world elevation, public
 * OpenStreetMap 3D buildings SceneServer.
 */

const OSM_BUILDINGS_URL =
  "https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer";
const OSM_BUILDINGS_ID = "osm-3d-buildings";
const RAY_LAYER_ID = "pick-ray";
const MARKER_LAYER_ID = "pick-marker";

type CameraPreset = "overview" | "street";

const CAMERAS: Record<
  CameraPreset,
  { position: [number, number, number]; heading: number; tilt: number }
> = {
  // Above the old town, tilted — plenty of roofs and streets to pick.
  overview: { position: [8.5417, 47.369, 760], heading: 10, tilt: 65 },
  // Just above the rooftops along the Limmat — facades fill the frame.
  street: { position: [8.5405, 47.3736, 480], heading: 35, tilt: 78 },
};

const DEFAULT_CAPTION =
  "Click anywhere — one ray, first hit wins. This is exactly what the Ray Casting article above describes.";

const INITIAL = { showRay: true, preset: "overview" as CameraPreset };

const RAY_SYMBOL = new LineSymbol3D({
  symbolLayers: [{ type: "line", size: 2.5, material: { color: "#ffd60a" } }],
});

const MARKER_SYMBOL = new PointSymbol3D({
  symbolLayers: [
    {
      type: "object",
      resource: { primitive: "sphere" },
      width: 14,
      height: 14,
      depth: 14,
      material: { color: "#ff3b78" },
    },
  ],
});

const formatDistance = (meters: number): string =>
  meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;

export default function ScenePicking(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const rayLayerRef = useRef<GraphicsLayer | null>(null);
  const markerLayerRef = useRef<GraphicsLayer | null>(null);
  const highlightRef = useRef<{ remove(): void } | null>(null);
  const [showRay, setShowRay] = useState(INITIAL.showRay);
  const [preset, setPreset] = useState<CameraPreset>(INITIAL.preset);
  const [caption, setCaption] = useState(DEFAULT_CAPTION);

  // The highlight handle is the one thing the view doesn't own — release it.
  useEffect(() => {
    return () => {
      highlightRef.current?.remove();
      highlightRef.current = null;
    };
  }, []);

  /** True once the view exists; all imperative access goes through this. */
  const readyScene = (): HTMLArcgisSceneElement | null => {
    const el = sceneRef.current;
    return el && el.view ? el : null;
  };

  const clearPick = (): void => {
    rayLayerRef.current?.removeAll();
    markerLayerRef.current?.removeAll();
    highlightRef.current?.remove();
    highlightRef.current = null;
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
    // StrictMode double-mounts and basemap changes can re-fire this; add once.
    if (el.map && !el.map.findLayerById(OSM_BUILDINGS_ID)) {
      el.map.add(
        new SceneLayer({ id: OSM_BUILDINGS_ID, url: OSM_BUILDINGS_URL, title: "OSM 3D Buildings" }),
      );
    }
    for (const id of [RAY_LAYER_ID, MARKER_LAYER_ID]) {
      if (el.map && !el.map.findLayerById(id)) {
        el.map.add(
          new GraphicsLayer({ id, listMode: "hide", elevationInfo: { mode: "absolute-height" } }),
        );
      }
    }
    const ray = el.map?.findLayerById(RAY_LAYER_ID);
    if (ray instanceof GraphicsLayer) {
      ray.visible = showRay;
      rayLayerRef.current = ray;
    }
    const marker = el.map?.findLayerById(MARKER_LAYER_ID);
    if (marker instanceof GraphicsLayer) markerLayerRef.current = marker;
  };

  /** The whole lesson: one ray from the camera through the pixel, first hit wins. */
  const pick = async (el: HTMLArcgisSceneElement, click: ClickEvent): Promise<void> => {
    const view = el.view;
    // Capture the eye BEFORE awaiting — the camera can move during the hit test.
    const eye = view.camera.position.clone();
    const exclude = [rayLayerRef.current, markerLayerRef.current].filter((l) => l !== null);
    const response = await view.hitTest({ x: click.x, y: click.y }, { exclude });

    clearPick();

    const first = response.results[0];
    let hitPoint: Point;
    let message: string;
    if (first && first.type === "graphic" && first.mapPoint) {
      hitPoint = first.mapPoint;
      message = `Ray hit a building ${formatDistance(first.distance)} away — the closest intersection along the camera→cursor ray.`;
      // Highlight the picked building on its layer view (v5: SceneLayerView.highlight).
      if (first.layer instanceof SceneLayer) {
        const graphic = first.graphic;
        void view
          .whenLayerView(first.layer)
          .then((layerView) => {
            highlightRef.current?.remove();
            highlightRef.current = layerView.highlight(graphic);
          })
          .catch(() => undefined);
      }
    } else if (response.ground.mapPoint && response.ground.distance > 0) {
      hitPoint = response.ground.mapPoint;
      message = `Ray hit the terrain ${formatDistance(response.ground.distance)} away — no building in the way, so the ground is the first intersection.`;
    } else {
      setCaption("That ray hit nothing — it shot past the city and out into the sky.");
      return;
    }

    // Marker sphere at the hit point…
    markerLayerRef.current?.add(
      new Graphic({
        geometry: new Point({
          longitude: hitPoint.longitude,
          latitude: hitPoint.latitude,
          z: hitPoint.z ?? 0,
        }),
        symbol: MARKER_SYMBOL.clone(),
      }),
    );
    // …and the camera→hit ray as a 3D line. Seen from where you clicked it
    // projects to a single point (it goes through your eye!) — orbit or switch
    // the camera preset to see it stretch across the city.
    rayLayerRef.current?.add(
      new Graphic({
        geometry: new Polyline({
          paths: [
            [
              [eye.longitude ?? 0, eye.latitude ?? 0, eye.z ?? 0],
              [hitPoint.longitude ?? 0, hitPoint.latitude ?? 0, hitPoint.z ?? 0],
            ],
          ],
        }),
        symbol: RAY_SYMBOL.clone(),
      }),
    );
    setCaption(message);
  };

  const handleClick = (event: { target: HTMLArcgisSceneElement; detail: ClickEvent }): void => {
    if (!event.target.view) return;
    void pick(event.target, event.detail).catch(() => undefined);
  };

  return (
    <PlaygroundFrame
      title="Pick a building: ray casting over Zurich"
      caption={caption}
      onReset={() => {
        setShowRay(INITIAL.showRay);
        setPreset(INITIAL.preset);
        setCaption(DEFAULT_CAPTION);
        clearPick();
        const el = readyScene();
        if (!el) return;
        if (rayLayerRef.current) rayLayerRef.current.visible = INITIAL.showRay;
        goToPreset(el, INITIAL.preset);
      }}
      controls={
        <>
          <SwitchControl
            label="Show ray"
            checked={showRay}
            onChange={(on) => {
              setShowRay(on);
              if (rayLayerRef.current) rayLayerRef.current.visible = on;
            }}
          />
          <SegmentedControl<CameraPreset>
            label="Camera"
            value={preset}
            options={[
              { value: "street", label: "Street" },
              { value: "overview", label: "Overview" },
            ]}
            onChange={(p) => {
              setPreset(p);
              const el = readyScene();
              if (el) goToPreset(el, p);
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            The yellow ray starts at your eye, so right after a click it projects to a single point.
            Switch the camera preset (or orbit) and the ray stretches out across the city to the
            pink marker — the first intersection.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="osm"
        ground="world-elevation"
        cameraPosition="8.5417, 47.3690, 760"
        cameraHeading={CAMERAS.overview.heading}
        cameraTilt={CAMERAS.overview.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
        onarcgisViewClick={handleClick}
      />
    </PlaygroundFrame>
  );
}
