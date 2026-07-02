import { useRef, useState } from "react";
import Camera from "@arcgis/core/Camera.js";
import Graphic from "@arcgis/core/Graphic.js";
import Mesh from "@arcgis/core/geometry/Mesh.js";
import Point from "@arcgis/core/geometry/Point.js";
import MeshMaterialMetallicRoughness from "@arcgis/core/geometry/support/MeshMaterialMetallicRoughness.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import FillSymbol3DLayer from "@arcgis/core/symbols/FillSymbol3DLayer.js";
import MeshSymbol3D from "@arcgis/core/symbols/MeshSymbol3D.js";
import "@arcgis/map-components/components/arcgis-scene";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * The *M* of MVP, made out of real SDK geometry: a 10 m box standing on
 * Münsterplatz in Basel whose Model matrix you drive by hand. Each slider is
 * one term of that matrix — translate, rotate, scale — and the box is rebuilt
 * every frame from a pristine base by applying them in the fixed order
 * scale → rotate → translate (`Mesh.scale` / `Mesh.rotate` / `Mesh.offset`,
 * all verified in @arcgis/core v5 typings). A semi-transparent white "ghost"
 * of the untransformed box marks model space so you can read the transform as
 * a displacement from where the box started.
 *
 * The order is the whole lesson: because these are in-place operations applied
 * to a clone, running them scale → rotate → translate composes the classic
 * M = T · R · S. Swap rotate and translate and the box would swing around the
 * plaza instead of spinning in place.
 */

const LAYER_ID = "mesh-transform";

/** Münsterplatz, Basel — the open square in front of the cathedral. */
const LON = 7.5922;
const LAT = 47.5563;
/** Used if the elevation query fails; the plaza sits at ~260 m. */
const FALLBACK_GROUND_Z = 260;

/** Base cube edge length, in metres. */
const BASE_SIZE = 10;

/** Metres per degree of longitude at the plaza's latitude (for offset()). */
const M_PER_DEG_LON = 111_320 * Math.cos((LAT * Math.PI) / 180);

/** One view: ~120 m south of the box, low tilt so the plaza reads as a floor. */
const CAMERA = { position: "7.5922, 47.5552, 305", heading: 0, tilt: 72 };

type Transform = { east: number; up: number; heading: number; scale: number };

const INITIAL: Transform = { east: 0, up: 0, heading: 0, scale: 1 };

type LoadStatus = "loading" | "ready" | "failed";

/** Empty fill layer keeps each mesh's own material (blue box / white ghost). */
const boxSymbol = (): MeshSymbol3D => new MeshSymbol3D({ symbolLayers: [new FillSymbol3DLayer()] });

export default function MeshTransform(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  /** The pristine, untransformed base box — every rebuild clones this. */
  const baseMeshRef = useRef<Mesh | null>(null);
  /** Bottom-centre anchor of the box; the fixed origin for scale and rotate. */
  const anchorRef = useRef<Point | null>(null);
  /** The current transformed graphic, replaced wholesale on every change. */
  const transformedRef = useRef<Graphic | null>(null);

  const [transform, setTransform] = useState<Transform>(INITIAL);
  const [status, setStatus] = useState<LoadStatus>("loading");

  /** True once the view exists; all imperative access goes through this. */
  const readyScene = (): HTMLArcgisSceneElement | null => {
    const el = sceneRef.current;
    return el && el.view ? el : null;
  };

  const getLayer = (el: HTMLArcgisSceneElement): GraphicsLayer | null => {
    const layer = el.map?.findLayerById(LAYER_ID);
    return layer instanceof GraphicsLayer ? layer : null;
  };

  /** Rebuild the displayed box from the base, S → R → T, and swap it in. */
  const rebuild = (el: HTMLArcgisSceneElement, t: Transform): void => {
    const base = baseMeshRef.current;
    const anchor = anchorRef.current;
    const layer = getLayer(el);
    if (!base || !anchor || !layer || layer.destroyed) return;
    const m = base.clone();
    // Fixed order — this composition is M = T · R · S applied to the vertices.
    m.scale(t.scale, { origin: anchor }); // grow in place around the anchor
    m.rotate(0, 0, t.heading, { origin: anchor }); // spin about the vertical axis
    // Gotcha: offset() on a local-vertex-space mesh moves the ORIGIN, which is
    // in spatial-reference units — horizontal offsets are DEGREES (z is metric).
    m.offset(t.east / M_PER_DEG_LON, 0, t.up); // translate east / up last
    const graphic = new Graphic({ geometry: m, symbol: boxSymbol() });
    const previous = transformedRef.current;
    if (previous) layer.remove(previous);
    layer.add(graphic);
    transformedRef.current = graphic;
  };

  /** Query ground elevation, build the base + ghost, add the initial box. */
  const addMeshes = async (el: HTMLArcgisSceneElement, layer: GraphicsLayer): Promise<void> => {
    let groundZ = FALLBACK_GROUND_Z;
    const ground = el.map?.ground;
    if (ground) {
      try {
        const query = await ground.queryElevation(new Point({ longitude: LON, latitude: LAT }));
        groundZ = query.geometry.z ?? FALLBACK_GROUND_Z;
      } catch {
        // keep the fallback elevation
      }
    }
    // The view may have been torn down (StrictMode) while we were querying.
    if (!el.view || layer.destroyed) return;

    const anchor = new Point({ longitude: LON, latitude: LAT, z: groundZ });
    const base = Mesh.createBox(anchor, {
      size: BASE_SIZE,
      vertexSpace: "local",
      material: new MeshMaterialMetallicRoughness({
        color: "#2563eb",
        roughness: 0.4,
        metallic: 0,
      }),
    });
    baseMeshRef.current = base;
    anchorRef.current = anchor;

    if (layer.graphics.length === 0) {
      // The ghost is the untransformed box — model space, drawn once and left.
      // alphaMode "blend" is required: the default "auto" would mask an alpha
      // below 0.5 to fully transparent instead of blending it.
      const ghost = Mesh.createBox(anchor, {
        size: BASE_SIZE,
        vertexSpace: "local",
        material: new MeshMaterialMetallicRoughness({
          color: [255, 255, 255, 0.25],
          alphaMode: "blend",
          roughness: 0.6,
          metallic: 0,
        }),
      });
      layer.add(new Graphic({ geometry: ghost, symbol: boxSymbol() }));
      rebuild(el, INITIAL);
    }
    setStatus("ready");
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
      void addMeshes(el, layer).catch(() => setStatus("failed"));
    }
  };

  const goToCamera = (el: HTMLArcgisSceneElement): void => {
    const [longitude, latitude, z] = CAMERA.position.split(",").map(Number);
    void el
      .goTo(
        new Camera({
          position: { longitude, latitude, z },
          heading: CAMERA.heading,
          tilt: CAMERA.tilt,
        }),
      )
      .catch(() => undefined); // interrupted animations reject — never crash on that
  };

  const { east, up, heading, scale } = transform;
  const caption =
    status === "failed"
      ? "The box failed to build — reload the page to retry."
      : `${status === "loading" ? "Placing the box… " : ""}S(${scale.toFixed(1)}×) → R(${Math.round(heading)}°) → T(${Math.round(east)} m east, ${Math.round(up)} m up) — applied in that fixed order. Swap the order in your head: rotating after translating would swing the box around the plaza instead of spinning it in place. The white ghost is the untransformed box — model space you're measuring against.`;

  /** Update one term, then imperatively rebuild from the new full transform. */
  const update = (patch: Partial<Transform>): void => {
    const next = { ...transform, ...patch };
    setTransform(next);
    const el = readyScene();
    if (el) rebuild(el, next);
  };

  return (
    <PlaygroundFrame
      title="Model transforms on Münsterplatz, Basel"
      caption={caption}
      onReset={() => {
        setTransform(INITIAL);
        const el = readyScene();
        if (!el) return;
        rebuild(el, INITIAL);
        goToCamera(el);
      }}
      controls={
        <>
          <SliderControl
            label="Translate east"
            value={east}
            min={-30}
            max={30}
            step={1}
            format={(v) => `${Math.round(v)} m`}
            onInput={(v) => update({ east: v })}
          />
          <SliderControl
            label="Translate up"
            value={up}
            min={0}
            max={30}
            step={1}
            format={(v) => `${Math.round(v)} m`}
            onInput={(v) => update({ up: v })}
          />
          <SliderControl
            label="Rotate (heading)"
            value={heading}
            min={0}
            max={360}
            step={5}
            format={(v) => `${Math.round(v)}°`}
            onInput={(v) => update({ heading: v })}
          />
          <SliderControl
            label="Scale"
            value={scale}
            min={0.5}
            max={3}
            step={0.1}
            format={(v) => `${v.toFixed(1)}×`}
            onInput={(v) => update({ scale: v })}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            This is the <strong>M</strong> of the model-view-projection chain, but built from real
            geometry instead of a 4×4 matrix: each slider is one term — translate, rotate, scale —
            and the box is rebuilt every change from a pristine base, applying them scale → rotate →
            translate (which composes M = T · R · S). Order matters: it's why scaling and rotating
            happen around the box's own anchor, before the translate carries it away.
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
