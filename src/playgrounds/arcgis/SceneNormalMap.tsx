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
import { SegmentedControl, SliderControl, SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Normal mapping on a real ArcGIS mesh with exactly two triangles: a flat
 * ~40 m plaza floor laid on the Europaplatz in front of the KKL in Lucerne.
 * Its cobblestone relief is entirely a lighting trick — a procedurally drawn
 * height field is turned into a tangent-space normal texture (Sobel finite
 * differences, encoded x→R, y→G, z→B, 0.5-centered) that bends the shading
 * normal per pixel without adding a single vertex. Under the *real sun* (the
 * time-of-day slider drives `environment.lighting.date`, same as GltfPbr) the
 * fake bumps pop at a low raking angle and flatten toward noon; orbit to the
 * edge and the silhouette is still a perfectly straight line.
 *
 * Every canvas is drawn deterministically (a tiny hash instead of Math.random)
 * so StrictMode's double render produces byte-identical textures.
 */

const PLANE_LAYER_ID = "scene-normal-map-plaza";

/** Europaplatz, in front of the KKL concert hall by the lake in Lucerne. */
const PLANE_LON = 8.311;
const PLANE_LAT = 47.0502;
/** Used if the elevation query fails; the plaza sits at ~435 m. */
const FALLBACK_GROUND_Z = 435;
/** Side length of the square floor, in metres. */
const PLANE_SIZE = 40;
/** Lift a few cm above the ground to avoid z-fighting with the basemap. */
const PLANE_LIFT = 0.05;

/** Texture resolution for every procedural canvas. */
const TEX = 512;
/** Running-bond brick cell (including mortar), in texels. */
const BRICK_W = 128;
const BRICK_H = 64;
const MORTAR = 8;
const SHOULDER = 10;
const MORTAR_H = 0.15;
const BRICK_H_VAL = 0.85;

/** A couple of shallow, deterministic "worn dips" in the paving. */
const WORN_DIPS = [
  { cx: 180, cy: 300, r: 78, depth: 0.35 },
  { cx: 384, cy: 132, r: 58, depth: 0.24 },
];

type CameraPreset = "raking" | "overhead";

const CAMERAS: Record<
  CameraPreset,
  { position: [number, number, number]; heading: number; tilt: number }
> = {
  // Low and close, west of the plaza, looking east across the floor toward the
  // morning sun — the angle at which the fake relief casts its longest shading.
  raking: { position: [8.3107, 47.0502, 443], heading: 90, tilt: 80 },
  // High and near-vertical: the bumps almost vanish and the floor reads flat.
  overhead: { position: [8.3111, 47.0498, 555], heading: 4, tilt: 30 },
};

/** Local Lucerne hour (UTC+2 in June) → Date for the sun position. */
const dateForHour = (hour: number): Date =>
  new Date(Date.UTC(2026, 5, 21, 0, Math.round(hour * 60) - 120));

const formatHour = (hour: number): string => {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const INITIAL = {
  hour: 7.5,
  preset: "raking" as CameraPreset,
  normalOn: true,
  strength: 1,
};

const mod = (n: number, m: number): number => ((n % m) + m) % m;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/** Deterministic [0,1) value keyed on a brick's integer (col, row). */
const hash2 = (x: number, y: number): number => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return h / 0xffffffff;
};

/** Height at one texel of the running-bond paving: bricks raised, mortar recessed. */
const heightAt = (x: number, y: number): number => {
  const row = Math.floor(y / BRICK_H);
  const offset = (row & 1) * (BRICK_W / 2);
  const ux = mod(x + offset, BRICK_W);
  const uy = mod(y, BRICK_H);
  const distX = Math.min(ux, BRICK_W - ux);
  const distY = Math.min(uy, BRICK_H - uy);
  const d = Math.min(distX, distY);
  const s = smoothstep(clamp01((d - MORTAR / 2) / SHOULDER));
  const col = Math.floor((x + offset) / BRICK_W);
  // Per-brick height jitter, only on the raised interior.
  let h = MORTAR_H + (BRICK_H_VAL - MORTAR_H) * s + (hash2(col, row) - 0.5) * 0.12 * s;
  for (const dip of WORN_DIPS) {
    const dd = Math.hypot(x - dip.cx, y - dip.cy);
    if (dd < dip.r) h -= dip.depth * smoothstep(1 - dd / dip.r);
  }
  return clamp01(h);
};

/** Precompute the height field once; the normal map is derived from it per strength. */
const buildHeightField = (): Float32Array => {
  const field = new Float32Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) field[y * TEX + x] = heightAt(x, y);
  }
  return field;
};

/** Cobblestone colour: mortar background, one jittered stone per brick cell. */
const buildColorCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = TEX;
  canvas.height = TEX;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgb(92, 88, 84)";
  ctx.fillRect(0, 0, TEX, TEX);
  const rows = Math.ceil(TEX / BRICK_H);
  const cols = Math.ceil(TEX / BRICK_W) + 1;
  for (let row = 0; row < rows; row++) {
    const offset = (row & 1) * (BRICK_W / 2);
    for (let col = -1; col < cols; col++) {
      const j = hash2(col, row);
      const k = hash2(col + 31, row + 17);
      const r = Math.round(150 + (j - 0.5) * 46 + (k - 0.5) * 10);
      const g = Math.round(146 + (j - 0.5) * 42);
      const b = Math.round(138 + (j - 0.5) * 36 - (k - 0.5) * 8);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      const cellX = col * BRICK_W - offset;
      ctx.fillRect(
        cellX + MORTAR / 2,
        row * BRICK_H + MORTAR / 2,
        BRICK_W - MORTAR,
        BRICK_H - MORTAR,
      );
    }
  }
  return canvas;
};

/**
 * Tangent-space normal map from the height field: a Sobel-style central
 * difference, amplified by `strength`, encoded into RGB (OpenGL/glTF +Y up).
 * At strength 0 every texel is (128, 128, 255) — a flat surface.
 */
const buildNormalCanvas = (field: Float32Array, strength: number): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = TEX;
  canvas.height = TEX;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(TEX, TEX);
  const data = image.data;
  const scale = 6 * strength;
  const at = (x: number, y: number): number => field[mod(y, TEX) * TEX + mod(x, TEX)];
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const gx = (at(x + 1, y) - at(x - 1, y)) * scale;
      const gy = (at(x, y - 1) - at(x, y + 1)) * scale;
      let nx = -gx;
      let ny = gy;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      const i = (y * TEX + x) * 4;
      data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
};

type LoadStatus = "loading" | "ready" | "failed";

export default function SceneNormalMap(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const originRef = useRef<Point | null>(null);
  const colorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const heightRef = useRef<Float32Array | null>(null);

  const [hour, setHour] = useState(INITIAL.hour);
  const [preset, setPreset] = useState<CameraPreset>(INITIAL.preset);
  const [normalOn, setNormalOn] = useState(INITIAL.normalOn);
  const [strength, setStrength] = useState(INITIAL.strength);
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

  /**
   * Rebuild the plaza graphic with the current material. Replacing the whole
   * Graphic is the most reliable way to force the mesh's material to re-render
   * after toggling the normal texture or regenerating it at a new strength.
   */
  const rebuildGraphic = (el: HTMLArcgisSceneElement, withNormal: boolean, bump: number): void => {
    const layer = el.map?.findLayerById(PLANE_LAYER_ID) as GraphicsLayer | undefined;
    const origin = originRef.current;
    const colorCanvas = colorCanvasRef.current;
    const field = heightRef.current;
    if (!layer || layer.destroyed || !origin || !colorCanvas || !field) return;
    const material = new MeshMaterialMetallicRoughness({
      colorTexture: { data: colorCanvas },
      normalTexture: withNormal ? { data: buildNormalCanvas(field, bump) } : null,
      metallic: 0,
      roughness: 0.85,
    });
    const mesh = Mesh.createPlane(origin, {
      size: PLANE_SIZE,
      facing: "up",
      vertexSpace: "local",
      material,
    });
    layer.removeAll();
    layer.add(
      new Graphic({
        geometry: mesh,
        // An empty fill layer keeps the mesh's own material untinted.
        symbol: new MeshSymbol3D({ symbolLayers: [new FillSymbol3DLayer()] }),
      }),
    );
  };

  /** Query the ground elevation, cache the origin and textures, draw the floor. */
  const addPlane = async (el: HTMLArcgisSceneElement, layer: GraphicsLayer): Promise<void> => {
    let groundZ = FALLBACK_GROUND_Z;
    const ground = el.map?.ground;
    if (ground) {
      try {
        const query = await ground.queryElevation(
          new Point({ longitude: PLANE_LON, latitude: PLANE_LAT }),
        );
        groundZ = query.geometry.z ?? FALLBACK_GROUND_Z;
      } catch {
        // keep the fallback elevation
      }
    }
    // The view may have been torn down (StrictMode) while we were querying.
    if (!el.view || layer.destroyed) return;
    originRef.current = new Point({
      longitude: PLANE_LON,
      latitude: PLANE_LAT,
      z: groundZ + PLANE_LIFT,
    });
    colorCanvasRef.current = buildColorCanvas();
    heightRef.current = buildHeightField();
    rebuildGraphic(el, normalOn, strength);
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
    if (el.map && !el.map.findLayerById(PLANE_LAYER_ID)) {
      const layer = new GraphicsLayer({
        id: PLANE_LAYER_ID,
        listMode: "hide",
        elevationInfo: { mode: "absolute-height" },
      });
      el.map.add(layer);
      void addPlane(el, layer).catch(() => setStatus("failed"));
    }
  };

  const caption =
    status === "failed"
      ? "The plaza mesh failed to build — reload the page to retry."
      : `${status === "loading" ? "Building the plaza… " : ""}Normal map ${
          normalOn ? "ON" : "OFF"
        }, strength ${strength.toFixed(1)}, sun at ${formatHour(
          hour,
        )} — every "bump" is a lighting trick on a mesh with exactly two triangles. Orbit to the floor's silhouette: the edge stays a perfectly straight line, because normal mapping only bends the light, never the surface.`;

  return (
    <PlaygroundFrame
      title="Fake cobblestones under a real sun — KKL plaza, Lucerne"
      caption={caption}
      onReset={() => {
        setHour(INITIAL.hour);
        setPreset(INITIAL.preset);
        setNormalOn(INITIAL.normalOn);
        setStrength(INITIAL.strength);
        const el = readyScene();
        if (!el) return;
        el.environment.lighting = {
          type: "sun",
          date: dateForHour(INITIAL.hour),
          directShadowsEnabled: true,
        };
        rebuildGraphic(el, INITIAL.normalOn, INITIAL.strength);
        goToPreset(el, INITIAL.preset);
      }}
      controls={
        <>
          <SwitchControl
            label="Normal map"
            checked={normalOn}
            onChange={(on) => {
              setNormalOn(on);
              const el = readyScene();
              if (el) rebuildGraphic(el, on, strength);
            }}
          />
          <SliderControl
            label="Bump strength"
            value={strength}
            min={0}
            max={2}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onInput={(s) => {
              setStrength(s);
              const el = readyScene();
              if (el && normalOn) rebuildGraphic(el, true, s);
            }}
          />
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
              { value: "raking", label: "Raking" },
              { value: "overhead", label: "Overhead" },
            ]}
            onChange={(p) => {
              setPreset(p);
              const el = readyScene();
              if (el) goToPreset(el, p);
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Bump vs normal mapping: a bump map stores a single height scalar per texel, a normal map
            stores the full surface direction — both only change how light is shaded, never the
            geometry. The r3f demo above shows the same trick on a sphere.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="osm"
        ground="world-elevation"
        cameraPosition="8.3107, 47.0502, 443"
        cameraHeading={CAMERAS.raking.heading}
        cameraTilt={CAMERAS.raking.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
    </PlaygroundFrame>
  );
}
