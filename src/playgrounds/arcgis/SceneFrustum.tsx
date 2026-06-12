import { useEffect, useRef, useState } from "react";
import Camera from "@arcgis/core/Camera.js";
import Graphic from "@arcgis/core/Graphic.js";
import Point from "@arcgis/core/geometry/Point.js";
import Polygon from "@arcgis/core/geometry/Polygon.js";
import Polyline from "@arcgis/core/geometry/Polyline.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import LineSymbol3D from "@arcgis/core/symbols/LineSymbol3D.js";
import PointSymbol3D from "@arcgis/core/symbols/PointSymbol3D.js";
import PolygonSymbol3D from "@arcgis/core/symbols/PolygonSymbol3D.js";
import "@arcgis/map-components/components/arcgis-scene";
import "@esri/calcite-components/components/calcite-notice";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * A real SceneView's frustum, seen from outside. The LEFT scene is the "game
 * view" you navigate; on every camera change we read its `view.camera`
 * (position, heading, tilt, fov — v5's fov is the DIAGONAL angle in degrees,
 * verified in Camera.d.ts), derive the four corner rays in a local
 * east/north/up frame anchored at the camera, intersect them with a ground
 * plane (or cap them at a fixed far distance), and redraw the resulting
 * yellow wedge in a GraphicsLayer on the RIGHT "observer" scene. Everything
 * outside that wedge is frustum-culled — never drawn at all.
 *
 * Keyless services only (verified): OSM basemap, Esri world elevation, public
 * OpenStreetMap 3D buildings SceneServer (left view only, for performance).
 */

const OSM_BUILDINGS_URL =
  "https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer";
const OSM_BUILDINGS_ID = "osm-3d-buildings";
const FRUSTUM_LAYER_ID = "frustum-overlay";

/** Rebuild the wedge at most ~5×/s; follow the wedge at most 1×/s. */
const THROTTLE_MS = 200;
const FOLLOW_MS = 1000;
/** "Show far cap" mode: planar far cap at this forward distance (meters). */
const FAR_DISTANCE = 2000;
/** Ground mode: rays that (nearly) miss the ground are capped here (meters). */
const MAX_GROUND_T = 8000;
/** Zurich old town elevation, used until the view reports a center elevation. */
const FALLBACK_GROUND_Z = 408;

type CameraSpec = { position: [number, number, number]; heading: number; tilt: number };

/** Modest start over the old town — the frustum the user steers. */
const LEFT_CAMERA: CameraSpec = { position: [8.5417, 47.369, 760], heading: 10, tilt: 65 };
/** High vantage south-east of the city, looking back at the left camera. */
const RIGHT_CAMERA: CameraSpec = { position: [8.575, 47.348, 3200], heading: 315, tilt: 52 };

const INITIAL = { farCap: false, follow: true };

const DEFAULT_CAPTION =
  "Navigate the left view — its camera frustum is redrawn live as the yellow wedge on the right.";

/** Image-plane corner signs, ordered as a ring: TL → TR → BR → BL. */
const CORNER_SIGNS: readonly (readonly [number, number])[] = [
  [-1, 1],
  [1, 1],
  [1, -1],
  [-1, -1],
];

const CAMERA_SYMBOL = new PointSymbol3D({
  symbolLayers: [
    {
      type: "object",
      resource: { primitive: "sphere" },
      width: 36,
      height: 36,
      depth: 36,
      material: { color: "#ff3b78" },
    },
  ],
});

const EDGE_SYMBOL = new LineSymbol3D({
  symbolLayers: [{ type: "line", size: 2, material: { color: "#ffd60a" } }],
});

const WEDGE_SYMBOL = new PolygonSymbol3D({
  symbolLayers: [{ type: "fill", material: { color: [255, 214, 10, 0.2] } }],
});

type Vec3 = readonly [number, number, number];

const toRad = (deg: number): number => (deg * Math.PI) / 180;

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export default function SceneFrustum(): React.JSX.Element {
  const leftRef = useRef<HTMLArcgisSceneElement | null>(null);
  const rightRef = useRef<HTMLArcgisSceneElement | null>(null);
  const frustumLayerRef = useRef<GraphicsLayer | null>(null);
  const lastBuildRef = useRef(0);
  const pendingRef = useRef<number | null>(null);
  const lastFollowRef = useRef(0);
  // Mirrors of the switch states so the throttled rebuild never reads stale closures.
  const farCapRef = useRef(INITIAL.farCap);
  const followRef = useRef(INITIAL.follow);
  const [farCap, setFarCap] = useState(INITIAL.farCap);
  const [follow, setFollow] = useState(INITIAL.follow);
  const [caption, setCaption] = useState(DEFAULT_CAPTION);

  // The throttle timeout is the only resource the views don't own — clear it.
  useEffect(() => {
    return () => {
      if (pendingRef.current !== null) window.clearTimeout(pendingRef.current);
      pendingRef.current = null;
    };
  }, []);

  /** True once a view exists; all imperative access goes through these. */
  const readyLeft = (): HTMLArcgisSceneElement | null => {
    const el = leftRef.current;
    return el && el.view ? el : null;
  };
  const readyRight = (): HTMLArcgisSceneElement | null => {
    const el = rightRef.current;
    return el && el.view ? el : null;
  };

  /**
   * The whole lesson: rebuild the left camera's frustum wedge in the right
   * view. Corner rays are derived in a local east/north/up frame anchored at
   * the camera; offsets are true meters, converted to Web Mercator units by
   * the 1/cos(lat) scale factor (z stays true meters) — honest at city scale.
   */
  const rebuildFrustum = (): void => {
    const leftEl = readyLeft();
    const rightEl = readyRight();
    const layer = frustumLayerRef.current;
    if (!leftEl || !rightEl || !layer) return;

    const view = leftEl.view;
    // The view exists a frame before its camera does — bail until it's real.
    const camera = view.camera as Camera | undefined;
    if (!camera?.position) return;
    const pos = camera.position;
    const width = view.width;
    const height = view.height;
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !width || !height) return;
    const camZ = pos.z ?? 0;

    // v5's Camera.fov is the DIAGONAL field of view: split it into horizontal
    // and vertical half-extents on the image plane at distance 1.
    const aspect = width / height;
    const tanDiag = Math.tan(toRad(camera.fov) / 2);
    const tanV = tanDiag / Math.hypot(1, aspect);
    const tanH = tanV * aspect;

    // ENU basis (x=east, y=north, z=up): tilt 0 looks straight down with the
    // top of the screen toward `heading`; tilt 90 looks at the horizon.
    const h = toRad(camera.heading);
    const t = toRad(camera.tilt);
    const fwd: Vec3 = [Math.sin(h) * Math.sin(t), Math.cos(h) * Math.sin(t), -Math.cos(t)];
    const up: Vec3 = [Math.sin(h) * Math.cos(t), Math.cos(h) * Math.cos(t), Math.sin(t)];
    const right = cross(fwd, up);

    // Ground plane at the terrain elevation under the left view's target.
    const centerZ = view.center?.z;
    const groundZ =
      typeof centerZ === "number" && Number.isFinite(centerZ) ? centerZ : FALLBACK_GROUND_Z;

    // True meters → Web Mercator units at this latitude.
    const k = 1 / Math.cos(toRad(pos.latitude ?? 47.37));
    const sr = view.spatialReference;

    const apex: [number, number, number] = [pos.x, pos.y, camZ];
    const corners = CORNER_SIGNS.map(([sx, sy]): [number, number, number] => {
      const dir: Vec3 = [
        fwd[0] + sx * tanH * right[0] + sy * tanV * up[0],
        fwd[1] + sx * tanH * right[1] + sy * tanV * up[1],
        fwd[2] + sx * tanH * right[2] + sy * tanV * up[2],
      ];
      // dot(dir, fwd) === 1, so the parameter below is forward distance along
      // the view axis: FAR_DISTANCE gives a planar far cap; otherwise we
      // intersect z(t) = camZ + dir.z * t with the ground plane.
      let dist: number;
      if (farCapRef.current) dist = FAR_DISTANCE;
      else if (dir[2] < -1e-6) dist = clamp((groundZ - camZ) / dir[2], 10, MAX_GROUND_T);
      else dist = MAX_GROUND_T; // ray points at/above the horizon — cap it
      return [pos.x + dir[0] * dist * k, pos.y + dir[1] * dist * k, camZ + dir[2] * dist];
    });

    const graphics: Graphic[] = [
      // The camera itself…
      new Graphic({
        geometry: new Point({ x: apex[0], y: apex[1], z: apex[2], spatialReference: sr }),
        symbol: CAMERA_SYMBOL.clone(),
      }),
      // …its four frustum edges…
      new Graphic({
        geometry: new Polyline({ paths: corners.map((c) => [apex, c]), spatialReference: sr }),
        symbol: EDGE_SYMBOL.clone(),
      }),
      // …and the wedge: four side faces plus the far/ground cap.
      ...corners.map(
        (c, i) =>
          new Graphic({
            geometry: new Polygon({
              rings: [[apex, c, corners[(i + 1) % 4], apex]],
              spatialReference: sr,
            }),
            symbol: WEDGE_SYMBOL.clone(),
          }),
      ),
      new Graphic({
        geometry: new Polygon({ rings: [[...corners, corners[0]]], spatialReference: sr }),
        symbol: WEDGE_SYMBOL.clone(),
      }),
    ];
    layer.removeAll();
    layer.addMany(graphics);

    setCaption(
      `Left camera — heading ${camera.heading.toFixed(0)}°, tilt ${camera.tilt.toFixed(0)}°, ` +
        `fov ${camera.fov.toFixed(0)}° (diagonal). Everything outside the yellow wedge is culled ` +
        "before a single triangle is drawn.",
    );

    // Follow: gently re-center the observer on the wedge (throttled, no animation).
    if (followRef.current) {
      const now = performance.now();
      if (now - lastFollowRef.current >= FOLLOW_MS) {
        lastFollowRef.current = now;
        const points = [apex, ...corners];
        const target = new Point({
          x: points.reduce((s, p) => s + p[0], 0) / points.length,
          y: points.reduce((s, p) => s + p[1], 0) / points.length,
          z: points.reduce((s, p) => s + p[2], 0) / points.length,
          spatialReference: sr,
        });
        void rightEl.goTo(target, { animate: false }).catch(() => undefined);
      }
    }
  };

  /** Trailing-edge throttle: at most one rebuild per THROTTLE_MS, never drops the last change. */
  const scheduleRebuild = (): void => {
    if (pendingRef.current !== null) return;
    const wait = Math.max(0, THROTTLE_MS - (performance.now() - lastBuildRef.current));
    pendingRef.current = window.setTimeout(() => {
      pendingRef.current = null;
      lastBuildRef.current = performance.now();
      rebuildFrustum();
    }, wait);
  };

  const goToCamera = (el: HTMLArcgisSceneElement, spec: CameraSpec): void => {
    const [longitude, latitude, z] = spec.position;
    void el
      .goTo(
        new Camera({
          position: { longitude, latitude, z },
          heading: spec.heading,
          tilt: spec.tilt,
        }),
      )
      .catch(() => undefined); // interrupted animations reject — never crash on that
  };

  const handleLeftReady = (event: { target: HTMLArcgisSceneElement }): void => {
    const el = event.target;
    // StrictMode double-mounts and basemap changes can re-fire this; add once.
    if (el.map && !el.map.findLayerById(OSM_BUILDINGS_ID)) {
      el.map.add(
        new SceneLayer({ id: OSM_BUILDINGS_ID, url: OSM_BUILDINGS_URL, title: "OSM 3D Buildings" }),
      );
    }
    scheduleRebuild();
  };

  const handleRightReady = (event: { target: HTMLArcgisSceneElement }): void => {
    const el = event.target;
    if (el.map && !el.map.findLayerById(FRUSTUM_LAYER_ID)) {
      el.map.add(
        new GraphicsLayer({
          id: FRUSTUM_LAYER_ID,
          listMode: "hide",
          elevationInfo: { mode: "absolute-height" },
        }),
      );
    }
    const layer = el.map?.findLayerById(FRUSTUM_LAYER_ID);
    if (layer instanceof GraphicsLayer) frustumLayerRef.current = layer;
    scheduleRebuild();
  };

  /** Only the LEFT view drives the overlay — the right view stays free. */
  const handleLeftChange = (): void => scheduleRebuild();

  return (
    <PlaygroundFrame
      title="See your own frustum: two views of one camera"
      caption={caption}
      onReset={() => {
        setFarCap(INITIAL.farCap);
        farCapRef.current = INITIAL.farCap;
        setFollow(INITIAL.follow);
        followRef.current = INITIAL.follow;
        setCaption(DEFAULT_CAPTION);
        const left = readyLeft();
        if (left) goToCamera(left, LEFT_CAMERA); // triggers a rebuild via arcgisViewChange
        const right = readyRight();
        if (right) goToCamera(right, RIGHT_CAMERA);
      }}
      controls={
        <>
          <SwitchControl
            label="Show far cap"
            checked={farCap}
            onChange={(on) => {
              setFarCap(on);
              farCapRef.current = on;
              rebuildFrustum();
            }}
          />
          <SwitchControl
            label="Follow"
            checked={follow}
            onChange={(on) => {
              setFollow(on);
              followRef.current = on;
              if (on) rebuildFrustum();
            }}
          />
          <calcite-notice open kind="brand" icon="viewshed" scale="s">
            <div slot="message">
              Frustum culling: anything outside this wedge is skipped before a single triangle is
              drawn. The tighter the frustum, the less work per frame.
            </div>
          </calcite-notice>
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Pan, tilt and zoom the left view — the wedge on the right tracks it live. "Show far cap"
            cuts the wedge at a 2&nbsp;km far plane instead of intersecting the ground; "Follow"
            keeps the observer centered on it (switch it off to explore freely).
          </p>
        </>
      }
    >
      <div className="flex h-full w-full">
        <div className="relative h-full min-w-0 flex-1">
          <arcgis-scene
            ref={leftRef}
            className="block h-full w-full"
            basemap="osm"
            ground="world-elevation"
            cameraPosition="8.5417, 47.3690, 760"
            cameraHeading={LEFT_CAMERA.heading}
            cameraTilt={LEFT_CAMERA.tilt}
            popupDisabled
            onarcgisViewReadyChange={handleLeftReady}
            onarcgisViewChange={handleLeftChange}
          />
          <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
            Game view — navigate me
          </span>
        </div>
        <div className="w-px shrink-0 bg-[var(--calcite-color-border-2)]" />
        <div className="relative h-full min-w-0 flex-1">
          <arcgis-scene
            ref={rightRef}
            className="block h-full w-full"
            basemap="osm"
            ground="world-elevation"
            cameraPosition="8.5750, 47.3480, 3200"
            cameraHeading={RIGHT_CAMERA.heading}
            cameraTilt={RIGHT_CAMERA.tilt}
            popupDisabled
            onarcgisViewReadyChange={handleRightReady}
          />
          <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
            Observer — the left camera&apos;s frustum
          </span>
        </div>
      </div>
    </PlaygroundFrame>
  );
}
