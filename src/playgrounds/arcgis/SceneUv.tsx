import { useRef, useState } from "react";
import Camera from "@arcgis/core/Camera.js";
import Graphic from "@arcgis/core/Graphic.js";
import Mesh from "@arcgis/core/geometry/Mesh.js";
import Point from "@arcgis/core/geometry/Point.js";
import MeshLocalVertexSpace from "@arcgis/core/geometry/support/MeshLocalVertexSpace.js";
import MeshMaterialMetallicRoughness from "@arcgis/core/geometry/support/MeshMaterialMetallicRoughness.js";
import MeshTexture from "@arcgis/core/geometry/support/MeshTexture.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import FillSymbol3DLayer from "@arcgis/core/symbols/FillSymbol3DLayer.js";
import MeshSymbol3D from "@arcgis/core/symbols/MeshSymbol3D.js";
import "@arcgis/map-components/components/arcgis-scene";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * A UV coordinate lab you can touch. A single upright billboard quad —
 * four vertices, two triangles — is built *by hand* on Plaine de Plainpalais
 * in Geneva with an explicit `vertexAttributes.uv` array. Nothing about the
 * 512×512 procedural "test card" texture ever changes; every control below
 * only rewrites those eight UV numbers (two per corner) and calls
 * `Mesh.vertexAttributesChanged()`. That is the whole lesson: UVs are the
 * addresses that pin an image onto a surface, and moving them slides, repeats,
 * or transposes the picture without editing a single pixel.
 *
 * The engine wraps out-of-[0,1] UVs by repeating the texture (MeshTexture's
 * default `wrap: "repeat"`), so the tile slider genuinely tiles on the GPU.
 */

const LAYER_ID = "scene-uv-billboard";

/** Plaine de Plainpalais — the big open gravel plaza in central Geneva. */
const LON = 6.1414;
const LAT = 46.1972;
/** Used if the ground elevation query fails; the plaza sits at ~375 m. */
const FALLBACK_GROUND_Z = 375;

/** Billboard dimensions in metres (local vertex space is always metres). */
const HALF_WIDTH = 15; // 30 m wide
const HEIGHT = 20; // 20 m tall

/**
 * Local ENU positions for the four corners: x = east, z = up, y = 0 so the
 * quad stands vertical facing south (toward the camera preset). Positions are
 * fixed; only the UVs below ever move.
 */
const POSITIONS = new Float64Array([
  -HALF_WIDTH,
  0,
  0, // 0 bottom-left  → uv (0,1)
  HALF_WIDTH,
  0,
  0, // 1 bottom-right → uv (1,1)
  HALF_WIDTH,
  0,
  HEIGHT, // 2 top-right   → uv (1,0)
  -HALF_WIDTH,
  0,
  HEIGHT, // 3 top-left    → uv (0,0)
]);

/** Two triangles winding around the quad. */
const FACES = new Uint16Array([0, 1, 2, 0, 2, 3]);

/**
 * The canonical UVs we edit *from* — never mutated, always recomputed against.
 * This engine (like glTF and image files) puts v = 0 at the TOP of the image
 * and counts downward — so the quad's top edge gets v = 0 and the bottom edge
 * v = 1. Classic OpenGL tutorials use the opposite (v up); mixing the two up
 * is the single most common cause of upside-down textures in the wild.
 */
const BASE_UV = [0, 1, 1, 1, 1, 0, 0, 0] as const;

const TEXTURE_SIZE = 512;

type UvState = {
  tile: number;
  offsetU: number;
  offsetV: number;
  swap: boolean;
};

const INITIAL = {
  tile: 1,
  offsetU: 0,
  offsetV: 0,
  swap: false,
  showGrid: false,
};

/** Camera ~80 m south of the billboard at eye level, looking north at it. */
const CAMERA = {
  position: [LON, 46.19648, FALLBACK_GROUND_Z + 13] as [number, number, number],
  heading: 0,
  tilt: 80,
};

/**
 * Recompute the eight UV numbers from BASE_UV: tile multiplies, offsets add,
 * and swap exchanges each corner's (u, v) — a live transpose of the image.
 */
function computeUv(state: UvState): Float32Array<ArrayBuffer> {
  const out = new Float32Array(8);
  for (let i = 0; i < 4; i++) {
    const bu = BASE_UV[i * 2];
    const bv = BASE_UV[i * 2 + 1];
    let u = bu * state.tile + state.offsetU;
    let v = bv * state.tile + state.offsetV;
    if (state.swap) {
      const t = u;
      u = v;
      v = t;
    }
    out[i * 2] = u;
    out[i * 2 + 1] = v;
  }
  return out;
}

/**
 * Paint the procedural test card: an 8×8 checker, a red border, big "UV"
 * letters, and an arrow to the (0,0) corner (top-left: this engine samples in
 * the glTF/image convention, v = 0 at the top row of the picture). With
 * `showGrid` it overlays UV gridlines and numeric 0.0…1.0 labels so you can
 * read exactly which coordinate lands where.
 */
function drawTestCard(canvas: HTMLCanvasElement, showGrid: boolean): void {
  const S = TEXTURE_SIZE;
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const cells = 8;
  const c = S / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#1e3a8a" : "#e0f2fe";
      ctx.fillRect(x * c, y * c, c, c);
    }
  }

  ctx.lineWidth = 18;
  ctx.strokeStyle = "#dc2626";
  ctx.strokeRect(9, 9, S - 18, S - 18);

  ctx.fillStyle = "#dc2626";
  ctx.font = "bold 220px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("UV", S / 2, S / 2);

  // Arrow into the top-left corner = texture coordinate (0,0): the image
  // convention this engine samples with (v grows downward from the top).
  ctx.strokeStyle = "#111827";
  ctx.fillStyle = "#111827";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(120, 120);
  ctx.lineTo(34, 34);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(34, 34);
  ctx.lineTo(34, 90);
  ctx.lineTo(90, 34);
  ctx.closePath();
  ctx.fill();
  ctx.font = "bold 30px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("(0,0)", 130, 118);

  if (showGrid) {
    const ticks = [0, 0.25, 0.5, 0.75, 1];
    ctx.strokeStyle = "rgba(17,24,39,0.55)";
    ctx.lineWidth = 3;
    ctx.font = "bold 26px system-ui, sans-serif";
    ctx.fillStyle = "#111827";
    for (const t of ticks) {
      const px = t * S;
      // v follows the image convention here: it increases downward with y.
      const py = t * S;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, S);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(S, py);
      ctx.stroke();
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(`u=${t.toFixed(2)}`, Math.min(px + 5, S - 92), 6);
      ctx.textBaseline = "bottom";
      ctx.fillText(`v=${t.toFixed(2)}`, 6, Math.min(py - 5 + 60, S - 6));
    }
  }
}

const fmt2 = (v: number): string => v.toFixed(2);

export default function SceneUv(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const layerRef = useRef<GraphicsLayer | null>(null);
  const meshRef = useRef<Mesh | null>(null);
  const materialRef = useRef<MeshMaterialMetallicRoughness | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const graphicRef = useRef<Graphic | null>(null);
  /** Live mirror of the UV controls so recompute never reads stale state. */
  const uvStateRef = useRef<UvState>({
    tile: INITIAL.tile,
    offsetU: INITIAL.offsetU,
    offsetV: INITIAL.offsetV,
    swap: INITIAL.swap,
  });

  const [tile, setTile] = useState(INITIAL.tile);
  const [offsetU, setOffsetU] = useState(INITIAL.offsetU);
  const [offsetV, setOffsetV] = useState(INITIAL.offsetV);
  const [swap, setSwap] = useState(INITIAL.swap);
  const [showGrid, setShowGrid] = useState(INITIAL.showGrid);

  /** True once the view exists; all imperative access goes through this. */
  const readyScene = (): HTMLArcgisSceneElement | null => {
    const el = sceneRef.current;
    return el && el.view ? el : null;
  };

  const goToPreset = (el: HTMLArcgisSceneElement): void => {
    const [longitude, latitude, z] = CAMERA.position;
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

  /** Push the current UV state into the mesh in place. */
  const applyUv = (): void => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.vertexAttributes.uv = computeUv(uvStateRef.current);
    mesh.vertexAttributesChanged();
  };

  /**
   * Redraw the canvas (optionally with the grid overlay), swap in a fresh
   * MeshTexture, and re-add the graphic so the renderer re-reads the material.
   */
  const applyTexture = (grid: boolean): void => {
    const canvas = canvasRef.current;
    const mesh = meshRef.current;
    const material = materialRef.current;
    const layer = layerRef.current;
    if (!canvas || !mesh || !material || !layer || layer.destroyed) return;
    drawTestCard(canvas, grid);
    material.colorTexture = new MeshTexture({ data: canvas });
    if (graphicRef.current) layer.remove(graphicRef.current);
    const graphic = new Graphic({
      geometry: mesh,
      symbol: new MeshSymbol3D({ symbolLayers: [new FillSymbol3DLayer()] }),
    });
    layer.add(graphic);
    graphicRef.current = graphic;
  };

  /** Build the hand-made billboard mesh and drop it on the plaza. */
  const addBillboard = async (el: HTMLArcgisSceneElement, layer: GraphicsLayer): Promise<void> => {
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

    const canvas = document.createElement("canvas");
    drawTestCard(canvas, INITIAL.showGrid);
    canvasRef.current = canvas;

    const material = new MeshMaterialMetallicRoughness({
      colorTexture: new MeshTexture({ data: canvas }),
      // Matte printed billboard: no metal, mostly diffuse, lit on both sides.
      metallic: 0,
      roughness: 0.9,
      doubleSided: true,
    });
    materialRef.current = material;

    const mesh = new Mesh({
      vertexSpace: new MeshLocalVertexSpace({ origin: [LON, LAT, groundZ] }),
      vertexAttributes: {
        position: POSITIONS.slice(),
        uv: computeUv(uvStateRef.current),
      },
      components: [{ faces: FACES.slice(), material }],
    });
    meshRef.current = mesh;

    // The view may have been torn down (StrictMode) while we queried elevation.
    if (!el.view || layer.destroyed || layer.graphics.length > 0) return;
    const graphic = new Graphic({
      geometry: mesh,
      symbol: new MeshSymbol3D({ symbolLayers: [new FillSymbol3DLayer()] }),
    });
    layer.add(graphic);
    graphicRef.current = graphic;
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
      layerRef.current = layer;
      el.map.add(layer);
      void addBillboard(el, layer).catch(() => undefined);
    }
  };

  const caption = `Each corner of this hand-built quad carries a (u, v) address into the same 512×512 test card. Tiling ×${tile} with offset (${fmt2(offsetU)}, ${fmt2(offsetV)})${
    swap ? " and U↔V swapped" : ""
  } ${tile > 1 ? "repeats and " : ""}shifts the picture across the surface — yet not one pixel of the texture image changes. Only eight numbers do.`;

  return (
    <PlaygroundFrame
      title="A UV billboard on Plaine de Plainpalais, Geneva"
      caption={caption}
      onReset={() => {
        setTile(INITIAL.tile);
        setOffsetU(INITIAL.offsetU);
        setOffsetV(INITIAL.offsetV);
        setSwap(INITIAL.swap);
        setShowGrid(INITIAL.showGrid);
        uvStateRef.current = {
          tile: INITIAL.tile,
          offsetU: INITIAL.offsetU,
          offsetV: INITIAL.offsetV,
          swap: INITIAL.swap,
        };
        applyUv();
        applyTexture(INITIAL.showGrid);
        const el = readyScene();
        if (el) goToPreset(el);
      }}
      controls={
        <>
          <SliderControl
            label="Tile (repeat)"
            value={tile}
            min={1}
            max={8}
            step={1}
            onInput={(v) => {
              setTile(v);
              uvStateRef.current.tile = v;
              applyUv();
            }}
          />
          <SliderControl
            label="Offset U"
            value={offsetU}
            min={0}
            max={1}
            step={0.05}
            format={fmt2}
            onInput={(v) => {
              setOffsetU(v);
              uvStateRef.current.offsetU = v;
              applyUv();
            }}
          />
          <SliderControl
            label="Offset V"
            value={offsetV}
            min={0}
            max={1}
            step={0.05}
            format={fmt2}
            onInput={(v) => {
              setOffsetV(v);
              uvStateRef.current.offsetV = v;
              applyUv();
            }}
          />
          <SwitchControl
            label="Swap U↔V"
            checked={swap}
            onChange={(v) => {
              setSwap(v);
              uvStateRef.current.swap = v;
              applyUv();
            }}
          />
          <SwitchControl
            label="Show UV grid on texture"
            checked={showGrid}
            onChange={(v) => {
              setShowGrid(v);
              applyTexture(v);
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Same idea as the low-level UV-unwrap diagram, now running in a real 3D engine: the mesh
            stores one (u, v) pair per vertex, and the GPU interpolates them across each triangle to
            look up the image. Values outside 0…1 wrap (repeat), which is why tiling works. One
            real-world gotcha on display: this engine (like glTF and image files) puts (0,0) at the
            image's <em>top</em>-left with v counting downward — classic OpenGL puts it bottom-left,
            and mixing the two up is why textures show up upside-down in so many projects.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="osm"
        ground="world-elevation"
        cameraPosition={`${CAMERA.position[0]}, ${CAMERA.position[1]}, ${CAMERA.position[2]}`}
        cameraHeading={CAMERA.heading}
        cameraTilt={CAMERA.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
    </PlaygroundFrame>
  );
}
