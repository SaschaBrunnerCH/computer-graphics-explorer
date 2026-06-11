import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SwitchControl } from "../../components/controls";

/**
 * UV unwrapping, both ways at once: on the left an r3f cube whose six faces
 * all sample ONE procedurally drawn atlas texture; on the right a 2D canvas
 * showing that same atlas with the UV islands outlined. Hovering a face in 3D
 * lights up its island in 2D, hovering an island tints the face in 3D — the
 * coupling is plain shared React state. "Unwrap" mode pulls the islands apart
 * to show each face's own 0..1 patch; "Atlas story" packs them back into the
 * single sheet the GPU actually binds.
 */

type Mode = "unwrap" | "atlas";

interface DemoState {
  mode: Mode;
  showGrid: boolean;
}

const INITIAL: DemoState = {
  mode: "unwrap",
  showGrid: true,
};

/** BoxGeometry face order: +X, −X, +Y, −Y, +Z, −Z. */
const FACES = [
  { name: "+X", color: "#d95f43", dark: "#a33c26" },
  { name: "−X", color: "#3f8fd9", dark: "#23629f" },
  { name: "+Y", color: "#43b06a", dark: "#287a44" },
  { name: "−Y", color: "#a45ad0", dark: "#76349d" },
  { name: "+Z", color: "#e0a93f", dark: "#a87a1f" },
  { name: "−Z", color: "#3bb3ad", dark: "#1f807b" },
] as const;

const COLS = 3;
const ROWS = 2;
const TILE = 256; // px per tile in the atlas canvas

const COLOR_BG = "#14181f";

/** UV rectangle of face i in the atlas (v measured bottom-up, like GL). */
function tileUvRect(i: number): { u0: number; v0: number; u1: number; v1: number } {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  return { u0: col / COLS, v0: row / ROWS, u1: (col + 1) / COLS, v1: (row + 1) / ROWS };
}

/** Top-left pixel of face i inside the atlas canvas (canvas y runs top-down). */
function tileCanvasPos(i: number): { x: number; y: number } {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  return { x: col * TILE, y: (ROWS - 1 - row) * TILE };
}

function drawTile(ctx: CanvasRenderingContext2D, i: number, x: number, y: number): void {
  const face = FACES[i];
  ctx.fillStyle = face.color;
  ctx.fillRect(x, y, TILE, TILE);
  // Diagonal stripes give the eye an orientation cue on the cube.
  ctx.strokeStyle = face.dark;
  ctx.lineWidth = 6;
  ctx.beginPath();
  for (let d = -TILE; d < TILE; d += 48) {
    ctx.moveTo(x + d, y + TILE);
    ctx.lineTo(x + d + TILE, y);
  }
  ctx.stroke();
  // Big number + axis name.
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.textAlign = "center";
  ctx.font = "bold 110px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(String(i + 1), x + TILE / 2, y + TILE / 2 - 14);
  ctx.font = "bold 34px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(face.name, x + TILE / 2, y + TILE / 2 + 70);
  ctx.textBaseline = "alphabetic";
  // Tile frame.
  ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
  ctx.lineWidth = 4;
  ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
}

/** The ONE texture every cube face reads from: 6 numbered tiles in a 3×2 sheet. */
function makeAtlasCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = COLS * TILE;
  canvas.height = ROWS * TILE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  for (let i = 0; i < 6; i++) {
    const { x, y } = tileCanvasPos(i);
    drawTile(ctx, i, x, y);
  }
  return canvas;
}

function AtlasCube({
  geometry,
  materials,
  onFace,
}: {
  geometry: THREE.BoxGeometry;
  materials: THREE.MeshBasicMaterial[];
  onFace: (face: number | null) => void;
}): React.JSX.Element {
  // Two triangles per box face → material/atlas face = floor(triangle / 2).
  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>): void => {
    e.stopPropagation();
    onFace(e.faceIndex == null ? null : Math.floor(e.faceIndex / 2));
  };
  return (
    <mesh
      geometry={geometry}
      material={materials}
      onPointerMove={pick}
      onClick={pick}
      onPointerOut={() => onFace(null)}
    />
  );
}

export default function UvUnwrap(): React.JSX.Element {
  const canvas2dRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<{ state: DemoState; activeFace: number | null }>({
    state: { ...INITIAL },
    activeFace: null,
  });
  const apiRef = useRef<{ draw: () => void } | null>(null);

  const [state, setState] = useState<DemoState>({ ...INITIAL });
  const [activeFace, setActiveFace] = useState<number | null>(null);

  const atlasCanvas = useMemo(() => makeAtlasCanvas(), []);

  const texture = useMemo(() => {
    const tex = new THREE.CanvasTexture(atlasCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, [atlasCanvas]);
  useEffect(() => () => texture.dispose(), [texture]);

  // One cube whose default per-face 0..1 UVs are remapped into the atlas rectangles.
  const geometry = useMemo(() => {
    const geo = new THREE.BoxGeometry(1.7, 1.7, 1.7);
    const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
    for (let face = 0; face < 6; face++) {
      const { u0, v0, u1, v1 } = tileUvRect(face);
      for (let k = 0; k < 4; k++) {
        const idx = face * 4 + k;
        uv.setXY(idx, u0 + uv.getX(idx) * (u1 - u0), v0 + uv.getY(idx) * (v1 - v0));
      }
    }
    uv.needsUpdate = true;
    return geo;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // Six materials only so each face can be tinted for the highlight — they all
  // share the single atlas texture (that sharing is the atlas story).
  const materials = useMemo(
    () => FACES.map(() => new THREE.MeshBasicMaterial({ map: texture })),
    [texture],
  );
  useEffect(() => {
    return () => {
      for (const m of materials) m.dispose();
    };
  }, [materials]);

  // Highlight in 3D: the hovered face stays bright, the rest dim down.
  useEffect(() => {
    materials.forEach((m, i) => {
      m.color.set(activeFace === null || i === activeFace ? "#ffffff" : "#566071");
    });
  }, [materials, activeFace]);

  // Mirror state into refs for the 2D canvas handlers, then redraw.
  useEffect(() => {
    stateRef.current = { state, activeFace };
    apiRef.current?.draw();
  }, [state, activeFace]);

  useEffect(() => {
    const canvas = canvas2dRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas not supported");

    // Screen rectangles of the islands, refreshed by draw() for hit-testing.
    let tileRects: { x: number; y: number; size: number }[] = [];

    const draw = (): void => {
      const { state: s, activeFace: active } = stateRef.current;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pw = Math.round(w * dpr);
      const ph = Math.round(h * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = COLOR_BG;
      ctx.fillRect(0, 0, w, h);

      // Fit the 3×2 sheet (plus gaps in unwrap mode) into the canvas.
      const gap = s.mode === "unwrap" ? 16 : 0;
      const margin = 30;
      const tile = Math.max(
        8,
        Math.min((w - margin * 2 - gap * (COLS - 1)) / COLS, (h - margin * 2 - gap) / ROWS),
      );
      const sheetW = COLS * tile + gap * (COLS - 1);
      const sheetH = ROWS * tile + gap;
      const x0 = (w - sheetW) / 2;
      const y0 = (h - sheetH) / 2;

      tileRects = FACES.map((_, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        return {
          x: x0 + col * (tile + gap),
          y: y0 + (ROWS - 1 - row) * (tile + gap),
          size: tile,
        };
      });

      // Islands: the same pixels the GPU samples, outlined.
      for (let i = 0; i < 6; i++) {
        const src = tileCanvasPos(i);
        const r = tileRects[i];
        ctx.drawImage(atlasCanvas, src.x, src.y, TILE, TILE, r.x, r.y, r.size, r.size);
        ctx.strokeStyle = "rgba(214, 226, 238, 0.6)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(r.x, r.y, r.size, r.size);
      }

      // UV grid: coordinates are the whole point of the right-hand view.
      if (s.showGrid) {
        ctx.font = "11px ui-monospace, monospace";
        if (s.mode === "atlas") {
          // One 0..1 grid across the single shared sheet.
          ctx.strokeStyle = "rgba(226, 232, 240, 0.35)";
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          for (let i = 0; i <= 4; i++) {
            const x = x0 + (sheetW * i) / 4;
            ctx.moveTo(x, y0);
            ctx.lineTo(x, y0 + sheetH);
            const y = y0 + (sheetH * i) / 4;
            if (i <= 4) {
              ctx.moveTo(x0, y);
              ctx.lineTo(x0 + sheetW, y);
            }
          }
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(226, 232, 240, 0.75)";
          ctx.textAlign = "center";
          for (let i = 0; i <= 4; i++) {
            ctx.fillText(String(i / 4), x0 + (sheetW * i) / 4, y0 + sheetH + 16);
          }
          ctx.textAlign = "right";
          for (let i = 0; i <= 4; i++) {
            // v runs bottom-up, canvas y runs top-down.
            ctx.fillText(String(i / 4), x0 - 8, y0 + sheetH - (sheetH * i) / 4 + 4);
          }
          ctx.textAlign = "left";
          ctx.fillText("u →", x0 + sheetW - 26, y0 - 8);
          ctx.fillText("v ↑", x0 - 26, y0 - 8);
        } else {
          // Pulled apart, each island is its own little 0..1 texture space.
          ctx.fillStyle = "rgba(226, 232, 240, 0.75)";
          for (const r of tileRects) {
            ctx.textAlign = "left";
            ctx.fillText("0,0", r.x + 4, r.y + r.size - 5);
            ctx.textAlign = "right";
            ctx.fillText("1,1", r.x + r.size - 4, r.y + 13);
          }
          ctx.textAlign = "left";
        }
      }

      // Active island: bright outline + veil, matching the tinted 3D face.
      if (active !== null) {
        const r = tileRects[active];
        ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
        ctx.fillRect(r.x, r.y, r.size, r.size);
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 3;
        ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.size - 3, r.size - 3);
      }

      // Header line.
      ctx.fillStyle = "rgba(226, 232, 240, 0.8)";
      ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(
        s.mode === "atlas"
          ? "the atlas: one shared texture, six islands"
          : "UV islands — hover one to find its face",
        10,
        18,
      );
    };

    apiRef.current = { draw };

    const faceAt = (e: PointerEvent): number | null => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const i = tileRects.findIndex(
        (r) => px >= r.x && px <= r.x + r.size && py >= r.y && py <= r.y + r.size,
      );
      return i === -1 ? null : i;
    };

    const onPointerMove = (e: PointerEvent): void => {
      const face = faceAt(e);
      canvas.style.cursor = face === null ? "default" : "pointer";
      setActiveFace(face);
    };
    const onPointerLeave = (): void => setActiveFace(null);

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);

    const resizeObserver = new ResizeObserver(() => draw());
    resizeObserver.observe(canvas);
    draw();

    return () => {
      resizeObserver.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      apiRef.current = null;
    };
  }, [atlasCanvas]);

  const faceLabel =
    activeFace !== null ? `face ${activeFace + 1} (${FACES[activeFace].name})` : null;
  const caption =
    state.mode === "atlas"
      ? `Atlas story: all six faces sample ONE texture — the GPU binds it once, so six surfaces cost one texture switch instead of six. Packing many objects' islands into shared sheets is how engines batch draw calls.${faceLabel ? ` Highlighted: ${faceLabel}.` : ""}`
      : faceLabel
        ? `UV coordinates at work: ${faceLabel} stores (u,v) addresses pointing into the highlighted island — texels there are exactly what you see on that face.`
        : "Every vertex stores a (u,v) address into the flat sheet on the right — that mapping is the unwrap. Hover a cube face or an island to see who points where.";

  return (
    <PlaygroundFrame
      title="UV unwrap — a cube and its flat skin"
      caption={caption}
      onReset={() => {
        setState({ ...INITIAL });
        setActiveFace(null);
      }}
      controls={
        <>
          <SegmentedControl<Mode>
            label="Mode"
            value={state.mode}
            options={[
              { value: "unwrap", label: "Unwrap" },
              { value: "atlas", label: "Atlas story" },
            ]}
            onChange={(mode) => setState((s) => ({ ...s, mode }))}
          />
          <SwitchControl
            label="Show UV grid"
            checked={state.showGrid}
            onChange={(showGrid) => setState((s) => ({ ...s, showGrid }))}
          />
        </>
      }
    >
      <div className="flex h-full flex-col md:flex-row">
        <div className="relative min-h-0 min-w-0 flex-1">
          <Canvas camera={{ position: [2.4, 1.9, 2.8], fov: 42 }} dpr={[1, 2]}>
            <color attach="background" args={[COLOR_BG]} />
            <AtlasCube geometry={geometry} materials={materials} onFace={setActiveFace} />
            <OrbitControls
              autoRotate
              autoRotateSpeed={0.9}
              enablePan={false}
              minDistance={2.6}
              maxDistance={7}
            />
          </Canvas>
          <span className="pointer-events-none absolute left-2 top-1.5 text-xs text-[#8fa3b8]">
            3D — hover a face
          </span>
        </div>
        <div className="relative min-h-0 min-w-0 flex-1 border-t border-[var(--calcite-color-border-3)] md:border-l md:border-t-0">
          <canvas
            ref={canvas2dRef}
            className="h-full w-full touch-none"
            aria-label="2D layout of the cube's UV islands in the texture atlas"
          />
        </div>
      </div>
    </PlaygroundFrame>
  );
}
