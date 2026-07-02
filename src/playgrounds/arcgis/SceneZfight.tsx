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
import { SegmentedControl, SliderControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Z-fighting made out of real engine geometry: two large, thin, co-planar
 * slabs (`Mesh.createPlane`, zero thickness, facing up) placed at the *same*
 * absolute height over the flat Theresienwiese in Munich. Because a plane has
 * no thickness, two of them at an identical z map to identical depth-buffer
 * values, so the depth test can't decide which is nearer — every frame, and
 * every tiny camera move, a different set of pixels wins. That shimmer is real
 * z-fighting from a production renderer, not a simulation of it.
 *
 * The slabs overlap ~70% but are offset horizontally so each keeps a visible
 * margin — proof there really are two of them. The "Elevation offset" slider
 * raises the blue slab a few centimetres by rebuilding it from a pristine base
 * (same clone-and-offset pattern as MeshTransform); a couple of cm cures the
 * flicker from the Close camera. Switch to Far and the *same* offset can shimmer
 * again: perspective packs most depth precision near the camera, so a gap that
 * spans several depth steps up close can collapse into a single step at range.
 */

const LAYER_ID = "scene-zfight";

/** Theresienwiese, Munich — a huge flat open field (the Oktoberfest grounds). */
const LON = 11.5498;
const LAT = 48.1319;
/** Used if the elevation query fails; the field sits at ~520 m. */
const FALLBACK_GROUND_Z = 520;

/** Slabs float this high over the ground so the camera can sit beneath the eyeline. */
const SLAB_LIFT = 8;
/** Each slab is a 60 × 60 m square. */
const SLAB_SIZE = 60;
/** Blue is shoved this far east of crimson: 20 m of 60 leaves a ~70% overlap. */
const BLUE_EAST_OFFSET = 20;

type CameraPreset = "close" | "far";

const CAMERAS: Record<
  CameraPreset,
  { position: [number, number, number]; heading: number; tilt: number }
> = {
  // ~150 m south of the slabs, low over the field — the fight fills the frame.
  close: { position: [LON, 48.1306, 545], heading: 0, tilt: 70 },
  // ~1.2 km south and higher — same slabs, far less depth precision on them.
  far: { position: [LON, 48.1211, 900], heading: 0, tilt: 65 },
};

const INITIAL = { offsetCm: 0, preset: "close" as CameraPreset };

type LoadStatus = "loading" | "ready" | "failed";

/** Empty fill layer keeps each mesh's own material (crimson / blue). */
const slabSymbol = (): MeshSymbol3D =>
  new MeshSymbol3D({ symbolLayers: [new FillSymbol3DLayer()] });

const flatMaterial = (color: string): MeshMaterialMetallicRoughness =>
  new MeshMaterialMetallicRoughness({ color, roughness: 0.7, metallic: 0 });

export default function SceneZfight(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  /** The pristine blue slab at zero offset — every rebuild clones this. */
  const blueBaseRef = useRef<Mesh | null>(null);
  /** The current blue graphic, replaced wholesale whenever the offset changes. */
  const blueGraphicRef = useRef<Graphic | null>(null);

  const [offsetCm, setOffsetCm] = useState(INITIAL.offsetCm);
  const [preset, setPreset] = useState<CameraPreset>(INITIAL.preset);
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

  /** Rebuild the blue slab from its base, lifted by `cm` centimetres, and swap it in. */
  const rebuildBlue = (el: HTMLArcgisSceneElement, cm: number): void => {
    const base = blueBaseRef.current;
    const layer = getLayer(el);
    if (!base || !layer || layer.destroyed) return;
    const m = base.clone();
    // At cm = 0 this is a no-op, so blue stays exactly co-planar with crimson
    // and the two MUST z-fight — there is no separation hack here.
    if (cm !== 0) m.offset(0, 0, cm / 100);
    const graphic = new Graphic({ geometry: m, symbol: slabSymbol() });
    const previous = blueGraphicRef.current;
    if (previous) layer.remove(previous);
    layer.add(graphic);
    blueGraphicRef.current = graphic;
  };

  /** Query ground elevation, build both co-planar slabs, add them. */
  const addSlabs = async (el: HTMLArcgisSceneElement, layer: GraphicsLayer): Promise<void> => {
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

    const slabZ = groundZ + SLAB_LIFT;
    const crimsonAt = new Point({ longitude: LON, latitude: LAT, z: slabZ });
    // Same absolute z, shoved east so it keeps a visible non-overlapped margin.
    const blueAt = new Point({ longitude: LON, latitude: LAT, z: slabZ });

    const crimson = Mesh.createPlane(crimsonAt, {
      size: { width: SLAB_SIZE, height: SLAB_SIZE },
      facing: "up",
      vertexSpace: "local",
      material: flatMaterial("#dc2626"),
    });
    const blueBase = Mesh.createPlane(blueAt, {
      size: { width: SLAB_SIZE, height: SLAB_SIZE },
      facing: "up",
      vertexSpace: "local",
      material: flatMaterial("#2563eb"),
    });
    // Bake the horizontal shove into the base so it survives every rebuild.
    // Gotcha: for local-vertex-space meshes, offset() moves the ORIGIN, which
    // lives in spatial-reference units — so east/north offsets are DEGREES,
    // not metres (z stays metric). Convert.
    const mPerDegLon = 111_320 * Math.cos((LAT * Math.PI) / 180);
    blueBase.offset(BLUE_EAST_OFFSET / mPerDegLon, 0, 0);
    blueBaseRef.current = blueBase;

    if (layer.graphics.length === 0) {
      layer.add(new Graphic({ geometry: crimson, symbol: slabSymbol() }));
      rebuildBlue(el, INITIAL.offsetCm);
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
      void addSlabs(el, layer).catch(() => setStatus("failed"));
    }
  };

  const goToPreset = (el: HTMLArcgisSceneElement, p: CameraPreset): void => {
    const { position, heading, tilt } = CAMERAS[p];
    const [longitude, latitude, z] = position;
    void el
      .goTo(new Camera({ position: { longitude, latitude, z }, heading, tilt }))
      .catch(() => undefined); // interrupted animations reject — never crash on that
  };

  const caption =
    status === "failed"
      ? "The slabs failed to build — reload the page to retry."
      : status === "loading"
        ? "Placing two co-planar slabs…"
        : offsetCm === 0
          ? "Two slabs at exactly the same height: the depth buffer can't order them, so every frame (and every camera twitch) different pixels win — that shimmer is z-fighting. Drag the camera a hair and watch the fight dance."
          : `+${offsetCm} cm: enough separation up close — now switch to the Far camera. At that distance ${offsetCm} cm may still fall inside a single depth step and the fight resumes. Nudge the camera to check.`;

  return (
    <PlaygroundFrame
      title="Z-fighting: two co-planar slabs over the Theresienwiese"
      caption={caption}
      onReset={() => {
        setOffsetCm(INITIAL.offsetCm);
        setPreset(INITIAL.preset);
        const el = readyScene();
        if (!el) return;
        rebuildBlue(el, INITIAL.offsetCm);
        goToPreset(el, INITIAL.preset);
      }}
      controls={
        <>
          <SliderControl
            label="Elevation offset"
            value={offsetCm}
            min={0}
            max={50}
            step={1}
            format={(v) => `${Math.round(v)} cm`}
            onInput={(cm) => {
              setOffsetCm(cm);
              const el = readyScene();
              if (el) rebuildBlue(el, cm);
            }}
          />
          <SegmentedControl<CameraPreset>
            label="Camera"
            value={preset}
            options={[
              { value: "close", label: "Close" },
              { value: "far", label: "Far" },
            ]}
            onChange={(p) => {
              setPreset(p);
              const el = readyScene();
              if (el) goToPreset(el, p);
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            The depth buffer stores each pixel's distance with finite precision, and perspective
            bunches most of that precision near the camera. Two co-planar surfaces resolve to the
            same stored value, so the depth test becomes a per-pixel coin flip — the flicker you
            see. Fixes: offset the geometry (this slider), push the near plane further out, or use a
            reversed-Z floating-point depth buffer. The low-level depth-buffer playground shows the
            raw buffer these values live in.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="osm"
        ground="world-elevation"
        cameraPosition={`${CAMERAS.close.position[0]}, ${CAMERAS.close.position[1]}, ${CAMERAS.close.position[2]}`}
        cameraHeading={CAMERAS.close.heading}
        cameraTilt={CAMERAS.close.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
    </PlaygroundFrame>
  );
}
