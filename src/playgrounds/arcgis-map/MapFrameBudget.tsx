import { useEffect, useRef, useState } from "react";
import Graphic from "@arcgis/core/Graphic.js";
import Point from "@arcgis/core/geometry/Point.js";
import SpatialReference from "@arcgis/core/geometry/SpatialReference.js";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import SimpleRenderer from "@arcgis/core/renderers/SimpleRenderer.js";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol.js";
import "@arcgis/map-components/components/arcgis-map";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * A real rendering workload with honest measurement: a client-side
 * FeatureLayer of up to 100k seeded points (generated in ~10k chunks per
 * macrotask so the UI never freezes) while OUR OWN requestAnimationFrame
 * deltas are plotted in a compact strip over the map — the FrameTime demo's
 * visual language at ~80 px. We measure our loop, the map engine does the
 * real work; both share the one frame budget, so heavier layers and the
 * auto-pan (constant redraws) show up directly in the bars.
 *
 * No basemap — the map only has the point layer plus a dark view background
 * (fully keyless, and the workload stays ours alone, not tile fetches).
 * Without a basemap the view cannot derive a spatial reference, so WGS84 is
 * passed explicitly — otherwise the view never becomes ready on an empty map.
 */

const LAYER_ID = "budget-points";
const SEED = 0xf00d_60fa;
const CHUNK = 10_000;
const DEBOUNCE_MS = 250;

const HISTORY = 90; // frames kept in the strip
const REFRESH_MS = 1000 / 60;
const GRAPH_MAX_MS = 50; // y-axis ceiling
const PAN_SPEED_PX = 30; // auto-pan drift, px/s
const PAN_RADIUS_PX = 110; // circular drift radius

// Same generation extent as the initial view, so the work is on screen.
const CENTER = { longitude: 9, latitude: 47 };
const SPREAD = { longitude: 10, latitude: 5.5 };

const COLOR_BG = "rgba(11, 14, 20, 0.82)";
const COLOR_PANEL = "rgba(148, 163, 184, 0.35)";
const COLOR_TEXT = "rgba(226, 232, 240, 0.8)";
const COLOR_GUIDE_60 = "rgba(74, 222, 128, 0.8)";

const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const INITIAL = { pointCount: 10_000, autoPan: !prefersReducedMotion };

/** Deterministic LCG in [0, 1) — same count always yields the same points. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

function barColor(ms: number): string {
  if (ms <= REFRESH_MS + 1.5) return "#4ade80"; // within budget
  if (ms <= REFRESH_MS * 2 + 1.5) return "#fbbf24"; // one missed refresh
  return "#f87171"; // worse
}

function buildLayer(graphics: Graphic[]): FeatureLayer {
  return new FeatureLayer({
    id: LAYER_ID,
    title: "Workload points",
    source: graphics,
    objectIdField: "OBJECTID",
    fields: [{ name: "OBJECTID", type: "oid" }],
    popupEnabled: false,
    renderer: new SimpleRenderer({
      symbol: new SimpleMarkerSymbol({
        style: "circle",
        size: 4,
        color: [56, 189, 248, 0.85],
        outline: { color: [0, 0, 0, 0], width: 0 },
      }),
    }),
  });
}

export default function MapFrameBudget(): React.JSX.Element {
  const mapRef = useRef<HTMLArcgisMapElement | null>(null);
  const stripRef = useRef<HTMLCanvasElement | null>(null);
  const framesRef = useRef<number[]>([]);
  const autoPanRef = useRef(INITIAL.autoPan);
  const angleRef = useRef(0);
  const baseCenterRef = useRef<Point | null>(null);
  const genTokenRef = useRef(0);
  const debounceRef = useRef<number | undefined>(undefined);

  const [pointCount, setPointCount] = useState(INITIAL.pointCount);
  const [autoPan, setAutoPan] = useState(INITIAL.autoPan);
  const [generating, setGenerating] = useState<number | null>(null); // points built so far
  const [stats, setStats] = useState({ fps: 60, p99: REFRESH_MS });

  useEffect(() => {
    autoPanRef.current = autoPan;
  }, [autoPan]);

  /** True once the view exists; all imperative access goes through this. */
  const readyMap = (): HTMLArcgisMapElement | null => {
    const el = mapRef.current;
    return el && el.view ? el : null;
  };

  /**
   * Rebuild the layer for `count` points: generate in CHUNK-sized macrotasks
   * (so a 100k drag never freezes the UI), then swap old layer for new. A
   * token cancels superseded runs; the old layer keeps rendering meanwhile.
   */
  const rebuildLayer = (count: number): void => {
    const token = ++genTokenRef.current;
    const rand = lcg(SEED);
    const graphics: Graphic[] = [];
    setGenerating(0);

    const step = (): void => {
      if (token !== genTokenRef.current || !mapRef.current) return;
      const end = Math.min(graphics.length + CHUNK, count);
      for (let i = graphics.length; i < end; i++) {
        graphics.push(
          new Graphic({
            geometry: new Point({
              longitude: CENTER.longitude + (rand() * 2 - 1) * SPREAD.longitude,
              latitude: CENTER.latitude + (rand() * 2 - 1) * SPREAD.latitude,
            }),
            attributes: { OBJECTID: i + 1 },
          }),
        );
      }
      if (graphics.length < count) {
        setGenerating(graphics.length);
        window.setTimeout(step, 0);
        return;
      }
      const el = mapRef.current;
      if (el.map) {
        const old = el.map.findLayerById(LAYER_ID);
        if (old) el.map.remove(old);
        el.map.add(buildLayer(graphics));
      }
      setGenerating(null);
    };
    window.setTimeout(step, 0);
  };

  const scheduleRebuild = (count: number): void => {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => rebuildLayer(count), DEBOUNCE_MS);
  };

  const handleViewReady = (event: { target: HTMLArcgisMapElement }): void => {
    const el = event.target;
    // Keyless by construction: no basemap at all, just a dark background.
    el.view.background = { color: "#0b0e14" };
    baseCenterRef.current = el.view.center.clone();
    if (el.map && !el.map.findLayerById(LAYER_ID)) rebuildLayer(INITIAL.pointCount);
  };

  // Our own rAF loop: measures frame deltas, drives the auto-pan drift, and
  // draws the compact frame-time strip. rAF stops while the tab is hidden;
  // the visibilitychange handler prevents one giant fake frame on return.
  useEffect(() => {
    const canvas = stripRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas not supported");

    let raf = 0;
    let lastNow = performance.now();
    let lastStats = 0;

    const onVisibility = (): void => {
      if (!document.hidden) lastNow = performance.now();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const draw = (): void => {
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
      ctx.strokeStyle = COLOR_PANEL;
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

      const top = 14;
      const bottom = h - 4;
      const graphH = bottom - top;
      const yFor = (ms: number): number =>
        bottom - (Math.min(ms, GRAPH_MAX_MS) / GRAPH_MAX_MS) * graphH;

      const frames = framesRef.current;
      const bw = (w - 8) / HISTORY;
      for (let i = 0; i < frames.length; i++) {
        const y = yFor(frames[i]);
        ctx.fillStyle = barColor(frames[i]);
        ctx.fillRect(4 + i * bw, y, Math.max(1, bw - 0.5), bottom - y);
      }

      // 16.7 ms guide on top of the bars so it stays readable.
      const gy = Math.round(yFor(REFRESH_MS)) + 0.5;
      ctx.strokeStyle = COLOR_GUIDE_60;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(4, gy);
      ctx.lineTo(w - 4, gy);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = "10px system-ui, sans-serif";
      ctx.fillStyle = COLOR_GUIDE_60;
      ctx.fillText("16.7 ms · 60 fps budget", 6, gy - 3);
      ctx.fillStyle = COLOR_TEXT;
      ctx.fillText("our rAF, last 90 frames", 6, 10);
      const last = frames[frames.length - 1];
      if (last !== undefined) {
        ctx.textAlign = "right";
        ctx.fillText(`now: ${last.toFixed(1)} ms`, w - 6, 10);
        ctx.textAlign = "left";
      }
    };

    const tick = (now: number): void => {
      const dt = Math.min(now - lastNow, 250);
      lastNow = now;

      if (!document.hidden) {
        framesRef.current.push(dt);
        if (framesRef.current.length > HISTORY) framesRef.current.shift();

        // Gentle continuous drift (~30 px/s on a circle) — every assignment
        // to view.center forces the map engine to redraw the whole layer.
        const el = readyMap();
        const base = baseCenterRef.current;
        if (autoPanRef.current && el && base) {
          const view = el.view;
          angleRef.current += ((PAN_SPEED_PX / PAN_RADIUS_PX) * dt) / 1000;
          const r = PAN_RADIUS_PX * view.resolution;
          view.center = new Point({
            x: base.x + r * Math.cos(angleRef.current),
            y: base.y + r * Math.sin(angleRef.current),
            spatialReference: base.spatialReference,
          });
        }

        if (now - lastStats > 250 && framesRef.current.length >= 10) {
          lastStats = now;
          const recent = framesRef.current.slice(-30);
          const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
          const sorted = [...framesRef.current].sort((a, b) => a - b);
          const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))];
          setStats({ fps: 1000 / mean, p99 });
        }
      }

      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Clear the pending debounce on unmount. Deliberately NOT bumping the
  // generation token here: this view becomes ready so fast (no basemap to
  // fetch) that the ready event can land inside StrictMode's mount→cleanup→
  // remount window — cancelling then would strand the demo with no layer,
  // since the surviving element never re-fires its one-shot ready event.
  // A real unmount is covered anyway: React nulls mapRef, and every chunk
  // step checks it before continuing.
  useEffect(() => () => window.clearTimeout(debounceRef.current), []);

  const readout = `${stats.fps.toFixed(0)} fps · p99 ${stats.p99.toFixed(1)} ms`;
  const caption =
    generating !== null
      ? `Generating ${generating.toLocaleString()} / ${pointCount.toLocaleString()} points in 10k chunks (the old layer keeps drawing meanwhile)… ${readout}.`
      : `${pointCount.toLocaleString()} client-side points · ${readout}. Honest framing: we measure our own rAF deltas while the map engine does the real work — both share one frame budget, so heavier layers eat it. ${
          autoPan
            ? "Auto-pan forces a full redraw every frame; raise the point count and watch the bars climb past 16.7 ms."
            : "Auto-pan is off, so the map mostly idles between interactions — drag or zoom it and the bars spike with the workload."
        }`;

  return (
    <PlaygroundFrame
      title="Frame budget on a live map"
      caption={caption}
      onReset={() => {
        setPointCount(INITIAL.pointCount);
        setAutoPan(INITIAL.autoPan);
        framesRef.current = [];
        angleRef.current = 0;
        setStats({ fps: 60, p99: REFRESH_MS });
        window.clearTimeout(debounceRef.current);
        rebuildLayer(INITIAL.pointCount);
        const el = readyMap();
        const base = baseCenterRef.current;
        if (el && base) el.view.center = base.clone();
      }}
      controls={
        <>
          <SliderControl
            label="Point count"
            value={pointCount}
            min={1_000}
            max={100_000}
            step={1_000}
            onInput={(v) => {
              setPointCount(v);
              scheduleRebuild(v);
            }}
            format={(v) => v.toLocaleString()}
          />
          <SwitchControl label="Auto-pan" checked={autoPan} onChange={setAutoPan} />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            The strip plots our own requestAnimationFrame deltas — green fits the 16.7 ms budget,
            yellow missed one refresh, red worse. Measurement pauses while the tab is hidden.
          </p>
        </>
      }
    >
      <arcgis-map
        ref={mapRef}
        className="block h-full w-full"
        spatialReference={SpatialReference.WGS84}
        center="9, 47"
        scale={20_000_000}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
      <canvas
        ref={stripRef}
        className="pointer-events-none absolute bottom-2 left-2 h-20 w-[calc(100%-1rem)]"
        aria-label="Live frame-time strip: bars show our requestAnimationFrame deltas against the 16.7 millisecond budget"
      />
    </PlaygroundFrame>
  );
}
