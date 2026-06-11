import * as THREE from "three";

/**
 * Procedural brick height map shared by the NormalMapping and Displacement
 * playgrounds. Everything is computed once into a cached Float32Array height
 * field (no network fetches), then rendered to offscreen canvases:
 *
 * - height canvas: grayscale, usable as `bumpMap` or `displacementMap`
 * - normal canvas: tangent-space normals derived from the heights with a
 *   Sobel filter, usable as `normalMap`
 *
 * The pattern tiles seamlessly in both directions (every frequency divides
 * the canvas size evenly), so callers may set RepeatWrapping freely.
 */

export const HEIGHT_MAP_SIZE = 512;

/** Brick layout: ROWS courses of COLS bricks, odd courses offset half a brick. */
const ROWS = 8;
const COLS = 4;
/** Half-width of the mortar groove and width of the beveled brick shoulder, in pixels. */
const MORTAR_HALF = 5;
const BEVEL = 10;
/** Height of the mortar floor (bricks plateau between ~0.7 and 1.0). */
const MORTAR_HEIGHT = 0.15;
/** How aggressively Sobel slopes tilt the derived normals. */
const NORMAL_STRENGTH = 2.0;

/** Deterministic 2D hash → [0, 1). Keeps the maps identical across mounts. */
function hash(a: number, b: number): number {
  let h = Math.imul(a + 1, 374761393) + Math.imul(b + 1, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

let cachedField: Float32Array | null = null;
let cachedHeightCanvas: HTMLCanvasElement | null = null;
let cachedNormalCanvas: HTMLCanvasElement | null = null;

/** Heights in [0, 1], row-major, canvas orientation (y grows downward). */
export function getHeightField(): Float32Array {
  if (cachedField) return cachedField;
  const size = HEIGHT_MAP_SIZE;
  const rowHeight = size / ROWS;
  const brickWidth = size / COLS;
  const field = new Float32Array(size * size);

  for (let y = 0; y < size; y += 1) {
    const row = Math.floor(y / rowHeight);
    const offset = row % 2 === 1 ? brickWidth / 2 : 0;
    const inBrickY = y % rowHeight;
    const edgeY = Math.min(inBrickY, rowHeight - inBrickY);
    for (let x = 0; x < size; x += 1) {
      const inBrickX = (x + offset) % brickWidth;
      const edgeX = Math.min(inBrickX, brickWidth - inBrickX);
      const col = Math.floor((x + offset) / brickWidth) % COLS;

      // 0 in the mortar groove, 1 on the brick face, smooth bevel between.
      const plateau =
        smoothstep(MORTAR_HALF, MORTAR_HALF + BEVEL, edgeX) *
        smoothstep(MORTAR_HALF, MORTAR_HALF + BEVEL, edgeY);

      // Per-brick base height plus a gentle, tileable undulation and a touch
      // of grain so the faces read as stone instead of machined plastic.
      const base = 0.7 + 0.3 * hash(col * 7 + 1, row * 13 + 3);
      const phase = hash(col * 3 + 5, row * 5 + 2) * Math.PI * 2;
      const wobble =
        0.06 *
        Math.sin((x / size) * Math.PI * 8 + phase) *
        Math.sin((y / size) * Math.PI * 10 + phase);
      const grain = (hash(x, y) - 0.5) * 0.04;

      field[y * size + x] = MORTAR_HEIGHT + plateau * (base - MORTAR_HEIGHT + wobble + grain);
    }
  }
  cachedField = field;
  return field;
}

function makeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } {
  const canvas = document.createElement("canvas");
  canvas.width = HEIGHT_MAP_SIZE;
  canvas.height = HEIGHT_MAP_SIZE;
  return { canvas, ctx: canvas.getContext("2d") };
}

function getHeightCanvas(): HTMLCanvasElement {
  if (cachedHeightCanvas) return cachedHeightCanvas;
  const field = getHeightField();
  const { canvas, ctx } = makeCanvas();
  if (ctx) {
    const image = ctx.createImageData(HEIGHT_MAP_SIZE, HEIGHT_MAP_SIZE);
    for (let i = 0; i < field.length; i += 1) {
      const v = Math.round(Math.min(1, Math.max(0, field[i])) * 255);
      image.data[i * 4] = v;
      image.data[i * 4 + 1] = v;
      image.data[i * 4 + 2] = v;
      image.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  }
  cachedHeightCanvas = canvas;
  return canvas;
}

function getNormalCanvas(): HTMLCanvasElement {
  if (cachedNormalCanvas) return cachedNormalCanvas;
  const field = getHeightField();
  const size = HEIGHT_MAP_SIZE;
  const { canvas, ctx } = makeCanvas();
  if (ctx) {
    const image = ctx.createImageData(size, size);
    const h = (x: number, y: number): number =>
      field[((y + size) % size) * size + ((x + size) % size)];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        // Sobel gradients in canvas space (x right, y down).
        const dx =
          h(x + 1, y - 1) +
          2 * h(x + 1, y) +
          h(x + 1, y + 1) -
          (h(x - 1, y - 1) + 2 * h(x - 1, y) + h(x - 1, y + 1));
        const dy =
          h(x - 1, y + 1) +
          2 * h(x, y + 1) +
          h(x + 1, y + 1) -
          (h(x - 1, y - 1) + 2 * h(x, y - 1) + h(x + 1, y - 1));
        // OpenGL-style tangent-space normal. CanvasTexture flips Y, so canvas
        // +y maps to UV −v, which flips the sign of the green channel back.
        const nx = -dx * NORMAL_STRENGTH;
        const ny = dy * NORMAL_STRENGTH;
        const nz = 1;
        const len = Math.hypot(nx, ny, nz);
        const i = (y * size + x) * 4;
        image.data[i] = Math.round((nx / len) * 127.5 + 127.5);
        image.data[i + 1] = Math.round((ny / len) * 127.5 + 127.5);
        image.data[i + 2] = Math.round((nz / len) * 127.5 + 127.5);
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }
  cachedNormalCanvas = canvas;
  return canvas;
}

/**
 * Grayscale brick height map for use as `bumpMap` / `displacementMap`.
 * Returns a fresh texture each call so every caller owns (and disposes) its own.
 */
export function createHeightMapTexture(): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(getHeightCanvas());
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Tangent-space normal map derived from the same height field (Sobel). */
export function createNormalMapTexture(): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(getNormalCanvas());
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
