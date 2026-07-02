import { useCallback, useEffect, useRef, useState } from "react";
import Basemap from "@arcgis/core/Basemap.js";
import VectorTileLayer from "@arcgis/core/layers/VectorTileLayer.js";
import "@arcgis/map-components/components/arcgis-map";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl, SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * A production texture atlas, unpacked. The vector basemap on the left draws
 * every POI icon — museums, restaurants, transit, parks — from ONE texture:
 * the OpenStreetMap_v2 sprite sheet. The right panel shows that texture as it
 * really is: 871 tiny images packed into a single 1,728-px PNG, each addressed
 * by an (x, y, width, height) rectangle in the companion sprite.json.
 *
 * Both files are part of the ArcGIS vector-tile service (curl-verified keyless
 * with `access-control-allow-origin: *`), so we fetch them at mount and draw
 * the PNG onto our own canvas — no API key, no third-party host. This is the
 * same UV-rectangle idea as the UV playgrounds above, made concrete on a map.
 */

const SPRITE_BASE =
  "https://basemaps.arcgis.com/arcgis/rest/services/OpenStreetMap_v2/VectorTileServer/resources/sprites/sprite";
const SPRITE_JSON = `${SPRITE_BASE}.json`;
const SPRITE_PNG = `${SPRITE_BASE}.png`;

const VECTOR_TILES_URL =
  "https://basemaps.arcgis.com/arcgis/rest/services/OpenStreetMap_v2/VectorTileServer";
const VECTOR_BASEMAP_ID = "osm-vector-tiles";

/** Central Zurich — dense with museum/restaurant/transit/park icons at z15. */
const CENTER: [number, number] = [8.5417, 47.3769];
const CENTER_ATTR = `${CENTER[0]}, ${CENTER[1]}`;
const INITIAL_ZOOM = 15;

const SHEET_ZOOM = { min: 1, max: 8, step: 0.5 };
// Sheet zoom defaults to 3× — at 1× the whole atlas squeezes into the panel
// and its mostly-transparent background reads as a black void.
const INITIAL = { sheetZoom: 3, showAll: false, category: "museum" };

/** One sprite frame's rectangle in the sheet, as stored in sprite.json. */
interface SpriteRect {
  x: number;
  y: number;
  width: number;
  height: number;
  pixelRatio: number;
  sdf: boolean;
}

/**
 * Curated categories: each resolves at runtime to the first sprite key that
 * contains the term (verified present in the live JSON). "airport" has no
 * entry in this style, so the set is museum / restaurant / hospital / park.
 */
const CURATED = [
  { id: "museum", label: "Museum", term: "museum" },
  { id: "restaurant", label: "Food", term: "restaurant" },
  { id: "hospital", label: "Hospital", term: "hospital" },
  { id: "park", label: "Park", term: "park" },
] as const;
const SURPRISE_ID = "surprise";

type LoadStatus = "loading" | "ready" | "failed";

interface Curated {
  id: string;
  label: string;
  key: string;
}

/** Deterministic pick — same click count always yields the same sprite. */
function pickSeeded(keys: string[], seed: number): string {
  let s = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  s = (Math.imul(s ^ (s >>> 15), 2246822519) + 3266489917) >>> 0;
  return keys[s % keys.length];
}

const COLOR_SHEET_BG = "#0b0e14";
const COLOR_DIM = "rgba(8, 11, 18, 0.72)";
const COLOR_ALL_FRAMES = "rgba(56, 189, 248, 0.45)";
const COLOR_HIGHLIGHT = "#facc15";
const COLOR_PLACEHOLDER = "rgba(226, 232, 240, 0.6)";

/** Our verified keyless vector-tile basemap (one instance per map element). */
const makeVectorBasemap = (): Basemap =>
  new Basemap({
    id: VECTOR_BASEMAP_ID,
    title: "OpenStreetMap (vector tiles)",
    baseLayers: [new VectorTileLayer({ url: VECTOR_TILES_URL, title: "OSM vector tiles" })],
  });

export default function SpriteAtlas(): React.JSX.Element {
  const mapRef = useRef<HTMLArcgisMapElement | null>(null);
  const sheetRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const surpriseCountRef = useRef(0);
  // The element only creates its view once it has a map, so the basemap must
  // be supplied up front (a property, not a ready-handler swap).
  const [basemap] = useState(makeVectorBasemap);

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [sprites, setSprites] = useState<Record<string, SpriteRect> | null>(null);
  const [resolved, setResolved] = useState<Curated[]>([]);
  const [sheetSize, setSheetSize] = useState({ w: 0, h: 0 });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [category, setCategory] = useState(INITIAL.category);
  const [sheetZoom, setSheetZoom] = useState(INITIAL.sheetZoom);
  const [showAll, setShowAll] = useState(INITIAL.showAll);

  // Draw the atlas. Centers the whole sheet at 1×; as zoom climbs it scales
  // around the selected sprite's center, clamped to the sheet edges so the
  // highlighted rect stays framed and no empty space shows past the borders.
  const drawSheet = useCallback((): void => {
    const canvas = sheetRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (cw === 0 || ch === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.round(cw * dpr);
    const ph = Math.round(ch * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLOR_SHEET_BG;
    ctx.fillRect(0, 0, cw, ch);

    const img = imgRef.current;
    if (!img || !sprites) {
      ctx.fillStyle = COLOR_PLACEHOLDER;
      ctx.font = "12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        status === "failed" ? "Sprite sheet unavailable" : "Loading sprite sheet…",
        cw / 2,
        ch / 2,
      );
      ctx.textAlign = "left";
      return;
    }

    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;
    const fit = Math.min(cw / imgW, ch / imgH); // whole sheet fits at zoom 1
    const scale = fit * sheetZoom;

    const sel = selectedKey ? sprites[selectedKey] : undefined;
    const focusX = sel ? sel.x + sel.width / 2 : imgW / 2;
    const focusY = sel ? sel.y + sel.height / 2 : imgH / 2;
    const scaledW = imgW * scale;
    const scaledH = imgH * scale;
    // Translate so the focus point lands at canvas center, then clamp: when the
    // scaled sheet is smaller than the canvas it centers; otherwise it pans but
    // never past an edge.
    let tx = cw / 2 - focusX * scale;
    let ty = ch / 2 - focusY * scale;
    tx = scaledW <= cw ? (cw - scaledW) / 2 : Math.min(0, Math.max(cw - scaledW, tx));
    ty = scaledH <= ch ? (ch - scaledH) / 2 : Math.min(0, Math.max(ch - scaledH, ty));

    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = false; // pixelated look when magnified

    ctx.drawImage(img, 0, 0);

    if (sel) {
      // Dim the whole sheet, then repaint just the selected frame at full
      // brightness so the one icon pops out of the hundreds around it.
      ctx.fillStyle = COLOR_DIM;
      ctx.fillRect(0, 0, imgW, imgH);
      ctx.drawImage(img, sel.x, sel.y, sel.width, sel.height, sel.x, sel.y, sel.width, sel.height);
    }

    if (showAll) {
      // The money shot: outline every packed frame — one texture, 871 images.
      ctx.lineWidth = Math.max(0.5, 1 / scale);
      ctx.strokeStyle = COLOR_ALL_FRAMES;
      for (const s of Object.values(sprites)) {
        ctx.strokeRect(s.x + 0.5 / scale, s.y + 0.5 / scale, s.width, s.height);
      }
    }

    if (sel) {
      ctx.lineWidth = Math.max(1, 2 / scale);
      ctx.strokeStyle = COLOR_HIGHLIGHT;
      ctx.strokeRect(sel.x, sel.y, sel.width, sel.height);
    }

    ctx.restore();
  }, [sprites, selectedKey, sheetZoom, showAll, status]);

  // Redraw on every state change and whenever the canvas resizes.
  useEffect(() => {
    drawSheet();
    const canvas = sheetRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => drawSheet());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [drawSheet]);

  // Mount-time fetch of the two atlas files (JSON metadata + PNG sheet). This
  // is the one effect allowed to set state: results are guarded against a
  // StrictMode unmount, and the JSON fetch is aborted on cleanup.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const img = new Image();
    img.crossOrigin = "anonymous"; // service sends ACAO:* so the canvas stays untainted
    let jsonDone = false;
    let imgDone = false;
    const maybeReady = (): void => {
      if (jsonDone && imgDone && !cancelled) setStatus("ready");
    };

    fetch(SPRITE_JSON, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<Record<string, SpriteRect>>;
      })
      .then((data) => {
        if (cancelled) return;
        const keys = Object.keys(data);
        const resolvedCurated: Curated[] = [];
        for (const c of CURATED) {
          const key = keys.find((k) => k.toLowerCase().includes(c.term));
          if (key) resolvedCurated.push({ id: c.id, label: c.label, key });
        }
        setSprites(data);
        setResolved(resolvedCurated);
        const first = resolvedCurated[0];
        if (first) {
          setCategory(first.id);
          setSelectedKey(first.key);
        }
        jsonDone = true;
        maybeReady();
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });

    img.onload = (): void => {
      if (cancelled) return;
      imgRef.current = img;
      setSheetSize({ w: img.naturalWidth, h: img.naturalHeight });
      imgDone = true;
      maybeReady();
    };
    img.onerror = (): void => {
      if (!cancelled) setStatus("failed");
    };
    img.src = SPRITE_PNG;

    return () => {
      cancelled = true;
      controller.abort();
      img.onload = null;
      img.onerror = null;
    };
  }, []);

  const selectCategory = (id: string): void => {
    setCategory(id);
    if (id === SURPRISE_ID) {
      if (!sprites) return;
      surpriseCountRef.current += 1;
      setSelectedKey(pickSeeded(Object.keys(sprites), surpriseCountRef.current));
    } else {
      const found = resolved.find((c) => c.id === id);
      if (found) setSelectedKey(found.key);
    }
  };

  const options = [
    ...resolved.map((c) => ({ value: c.id, label: c.label })),
    { value: SURPRISE_ID, label: "Surprise me" },
  ];

  const sel = selectedKey && sprites ? sprites[selectedKey] : undefined;
  const count = sprites ? Object.keys(sprites).length : 0;
  const caption =
    status === "failed"
      ? "The sprite atlas failed to load — the map on the left still draws its icons from that same texture. Reload the page to retry."
      : status === "loading" || !sel
        ? "Loading the vector basemap's sprite atlas — its icon sheet plus the JSON that maps each icon to a rectangle…"
        : `'${selectedKey}' lives at (${sel.x}, ${sel.y}), ${sel.width}×${sel.height} px — one of ${count} images packed into this single ${sheetSize.w}-px texture. The map on the left binds ONE texture and draws every icon from it: that's why atlases exist.`;

  return (
    <PlaygroundFrame
      title="Sprite atlas behind a vector basemap"
      caption={caption}
      onReset={() => {
        setSheetZoom(INITIAL.sheetZoom);
        setShowAll(INITIAL.showAll);
        const first = resolved[0];
        if (first) {
          setCategory(first.id);
          setSelectedKey(first.key);
        }
        const el = mapRef.current;
        if (el && el.view)
          void el
            .goTo({ center: [...CENTER], zoom: INITIAL_ZOOM }, { animate: false })
            .catch(() => undefined); // interrupted navigations reject — never crash on that
      }}
      controls={
        <>
          {options.length > 1 ? (
            <SegmentedControl
              label="Sprite"
              value={category}
              options={options}
              onChange={selectCategory}
            />
          ) : (
            <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">Loading sprite atlas…</p>
          )}
          <SliderControl
            label="Sheet zoom"
            value={sheetZoom}
            min={SHEET_ZOOM.min}
            max={SHEET_ZOOM.max}
            step={SHEET_ZOOM.step}
            onInput={setSheetZoom}
            format={(v) => `${v}×`}
          />
          <SwitchControl label="Show all frames" checked={showAll} onChange={setShowAll} />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            A texture atlas packs many small images into one texture so the GPU binds it once and
            batches the draws instead of switching textures per icon. Each icon is addressed by a UV
            rectangle — the x / y / width / height you see highlighted — the same (u, v) idea as the
            UV demos above, here on a real basemap.
          </p>
        </>
      }
    >
      <div className="flex h-full w-full">
        <div className="relative h-full min-w-0 flex-1">
          <arcgis-map
            ref={mapRef}
            className="block h-full w-full"
            basemap={basemap}
            center={CENTER_ATTR}
            zoom={INITIAL_ZOOM}
            popupDisabled
          />
          <span className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
            Vector basemap — every icon from one texture
          </span>
        </div>
        <div className="relative h-full min-w-0 flex-1 border-l border-[var(--calcite-color-border-3)]">
          <canvas
            ref={sheetRef}
            className="block h-full w-full"
            aria-label="The vector basemap's sprite sheet: 871 icons packed into one texture, with the selected icon highlighted"
          />
          <span className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
            Sprite sheet (the single texture)
          </span>
        </div>
      </div>
    </PlaygroundFrame>
  );
}
