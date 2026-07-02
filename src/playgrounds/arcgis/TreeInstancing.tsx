import { useEffect, useRef, useState } from "react";
import Camera from "@arcgis/core/Camera.js";
import Graphic from "@arcgis/core/Graphic.js";
import Point from "@arcgis/core/geometry/Point.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import type PointSymbol3D from "@arcgis/core/symbols/PointSymbol3D.js";
import WebStyleSymbol from "@arcgis/core/symbols/WebStyleSymbol.js";
import "@arcgis/map-components/components/arcgis-scene";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl, SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Instancing, made visible: N copies of ONE realistic maple model scattered
 * over the flat Allmend field south of Zurich. A single Esri "web style" tree
 * symbol (EsriRealisticTreesStyle → "Acer", a ~3.5 MB glTF served keyless from
 * static.arcgis.com) is fetched ONCE with `WebStyleSymbol.fetchSymbol()`
 * (→ Promise<Symbol2D3DUnion>; narrowed to the PointSymbol3D it resolves to)
 * and that same symbol instance is reused for every graphic. Reusing the one
 * symbol is what lets the engine upload the mesh once and stamp it per point
 * (instancing / draw-call batching), so tripling the tree count barely moves
 * the frame time — which the live rAF meter over the stage lets you watch.
 *
 * We measure our own requestAnimationFrame deltas (honest — we can't read the
 * engine's draw-call count); the caption never claims a number, it explains
 * batching and the meter shows the consequence while the auto-orbit spins.
 */

const LAYER_ID = "tree-instances";
const SEED = 0x5ca1_ab1e;
const CHUNK = 200; // trees added per animation frame while filling
const MAX_TREES = 3000;
const TREE_HEIGHT = 12; // metres — a realistic Norway maple

/** Allmend field, south of Zurich — flat open ground at ~415 m. */
const FIELD = { lon: 8.5265, lat: 47.3405, z: 415 };
/** ~600 × 400 m scatter ellipse (half-axes in metres). */
const ELLIPSE = { rx: 300, ry: 200 };

// Local metres-per-degree at this latitude, for the scatter + orbit maths.
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = 111_320 * Math.cos((FIELD.lat * Math.PI) / 180);

const HISTORY = 60; // frames kept for the rolling average
const ORBIT_SPEED = 0.045; // radians/second — a gentle drift
const STATS_MS = 250; // how often we refresh the meter readout

type CameraPreset = "field" | "canopy";

/** Height above ground + look-down tilt; the orbit radius follows from tilt. */
const PRESETS: Record<CameraPreset, { height: number; tilt: number }> = {
  field: { height: 700, tilt: 65 }, // whole forest from above
  canopy: { height: 60, tilt: 80 }, // down among the trees
};

const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const INITIAL = {
  count: 800,
  preset: "field" as CameraPreset,
  autoOrbit: !prefersReducedMotion,
};

type LoadStatus = "loading" | "ready" | "failed";

/** Deterministic LCG in [0, 1) — no Math.random, so the forest is reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

/** MAX_TREES stable positions in the scatter ellipse — index i is always the same tree. */
const POSITIONS: { longitude: number; latitude: number }[] = (() => {
  const rand = lcg(SEED);
  const out: { longitude: number; latitude: number }[] = [];
  for (let i = 0; i < MAX_TREES; i++) {
    // sqrt() spreads points uniformly across the disc, then scale to the ellipse.
    const angle = 2 * Math.PI * rand();
    const radius = Math.sqrt(rand());
    const x = radius * ELLIPSE.rx * Math.cos(angle);
    const y = radius * ELLIPSE.ry * Math.sin(angle);
    out.push({
      longitude: FIELD.lon + x / M_PER_DEG_LON,
      latitude: FIELD.lat + y / M_PER_DEG_LAT,
    });
  }
  return out;
})();

/** Camera orbiting the field centre: placed at `angle` bearing, looking inward. */
function cameraFor(preset: CameraPreset, angle: number): Camera {
  const { height, tilt } = PRESETS[preset];
  const radius = height * Math.tan((tilt * Math.PI) / 180);
  const longitude = FIELD.lon + (radius * Math.sin(angle)) / M_PER_DEG_LON;
  const latitude = FIELD.lat + (radius * Math.cos(angle)) / M_PER_DEG_LAT;
  const heading = ((angle * 180) / Math.PI + 180) % 360;
  return new Camera({
    position: { longitude, latitude, z: FIELD.z + height },
    heading,
    tilt,
  });
}

const FIELD_START = cameraFor("field", 0);

export default function TreeInstancing(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const layerRef = useRef<GraphicsLayer | null>(null);
  const symbolRef = useRef<PointSymbol3D | null>(null);
  const treesRef = useRef<Graphic[]>([]);
  const genTokenRef = useRef(0); // aborts a superseded / unmounted chunked fill
  const framesRef = useRef<number[]>([]);
  const angleRef = useRef(0);
  const autoOrbitRef = useRef(INITIAL.autoOrbit);
  const presetRef = useRef<CameraPreset>(INITIAL.preset);
  const countRef = useRef(INITIAL.count);

  const [count, setCount] = useState(INITIAL.count);
  const [preset, setPreset] = useState<CameraPreset>(INITIAL.preset);
  const [autoOrbit, setAutoOrbit] = useState(INITIAL.autoOrbit);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [shown, setShown] = useState(0);
  const [meter, setMeter] = useState({ ms: 16.7, fps: 60 });

  // Mirror the live controls into refs the rAF loop reads (ref writes in an
  // effect are lint-safe; writing them during render would not be).
  useEffect(() => {
    autoOrbitRef.current = autoOrbit;
  }, [autoOrbit]);
  useEffect(() => {
    presetRef.current = preset;
  }, [preset]);

  /** True once the view exists; all imperative access goes through this. */
  const readyScene = (): HTMLArcgisSceneElement | null => {
    const el = sceneRef.current;
    return el && el.view ? el : null;
  };

  /**
   * Grow or shrink the layer to `target` trees, reusing the one fetched
   * symbol for every graphic. Growth happens CHUNK trees per frame so the UI
   * never locks; a generation token aborts an in-flight fill when the slider
   * moves again or the view is torn down. Shrinking removes the array's tail.
   */
  const fillTo = (target: number): void => {
    const layer = layerRef.current;
    const symbol = symbolRef.current;
    if (!layer || !symbol) return;
    const token = ++genTokenRef.current;
    const trees = treesRef.current;

    if (trees.length >= target) {
      const removed = trees.splice(target);
      if (removed.length) layer.removeMany(removed);
      setShown(trees.length);
      return;
    }

    const step = (): void => {
      // Abort if superseded, or if the view/layer was destroyed (real unmount).
      if (token !== genTokenRef.current || !sceneRef.current || layer.destroyed) return;
      const end = Math.min(trees.length + CHUNK, target);
      const batch: Graphic[] = [];
      for (let i = trees.length; i < end; i++) {
        const g = new Graphic({ geometry: new Point(POSITIONS[i]), symbol });
        batch.push(g);
        trees.push(g);
      }
      layer.addMany(batch);
      setShown(trees.length);
      if (trees.length < target) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  /** Fetch the tree model once, scale it to a realistic height, then fill. */
  const loadSymbol = async (el: HTMLArcgisSceneElement, layer: GraphicsLayer): Promise<void> => {
    const web = new WebStyleSymbol({ styleName: "EsriRealisticTreesStyle", name: "Acer" });
    const fetched = await web.fetchSymbol();
    // The view may have been torn down (StrictMode) while the model loaded.
    if (!el.view || layer.destroyed) return;
    if (fetched.type !== "point-3d") {
      setStatus("failed");
      return;
    }
    const symbol = fetched.clone();
    // Clearing width/depth lets them recompute from height, keeping the model's
    // proportions while pinning the maple to ~12 m tall.
    symbol.symbolLayers.forEach((sl) => {
      if (sl.type === "object") {
        sl.width = undefined;
        sl.depth = undefined;
        sl.height = TREE_HEIGHT;
      }
    });
    symbolRef.current = symbol;
    setStatus("ready");
    fillTo(countRef.current);
  };

  const handleViewReady = (event: { target: HTMLArcgisSceneElement }): void => {
    const el = event.target;
    // StrictMode double-mounts can re-fire this; add the layer only once.
    if (el.map && !el.map.findLayerById(LAYER_ID)) {
      const layer = new GraphicsLayer({
        id: LAYER_ID,
        listMode: "hide",
        // "on-the-ground" drapes each tree onto the terrain — no per-point z.
        elevationInfo: { mode: "on-the-ground" },
      });
      el.map.add(layer);
      layerRef.current = layer;
      void loadSymbol(el, layer).catch(() => setStatus("failed"));
    }
  };

  // One rAF loop: measures our frame deltas, refreshes the meter readout, and
  // (when enabled) drives the orbit by assigning view.camera each frame. Cheap
  // and synchronous — no goTo promises. The effect owns start/stop so lint and
  // StrictMode stay happy; setState here runs from a rAF callback, not render.
  useEffect(() => {
    let raf = 0;
    let lastNow = performance.now();
    let lastStats = 0;

    const onVisibility = (): void => {
      if (!document.hidden) lastNow = performance.now();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const tick = (now: number): void => {
      const dt = Math.min(now - lastNow, 250);
      lastNow = now;

      if (!document.hidden) {
        const frames = framesRef.current;
        frames.push(dt);
        if (frames.length > HISTORY) frames.shift();

        if (autoOrbitRef.current) {
          const el = readyScene();
          if (el) {
            angleRef.current += (ORBIT_SPEED * dt) / 1000;
            el.view.camera = cameraFor(presetRef.current, angleRef.current);
          }
        }

        if (now - lastStats > STATS_MS && frames.length >= 10) {
          lastStats = now;
          const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
          setMeter({ ms: mean, fps: 1000 / mean });
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const caption =
    status === "failed"
      ? "The tree model failed to load — reload the page to retry. The instancing idea still holds: one uploaded mesh, stamped per position."
      : `${status === "loading" ? "Loading the maple model… " : ""}${shown.toLocaleString()} of ${count.toLocaleString()} copies of ONE ~3.5 MB maple model — the engine uploads the mesh once and stamps it per position (instancing), which is why tripling the trees barely moves the frame time. Watch the meter while it orbits.`;

  return (
    <PlaygroundFrame
      title="A forest from one tree — Allmend, Zurich"
      caption={caption}
      onReset={() => {
        setCount(INITIAL.count);
        countRef.current = INITIAL.count;
        setPreset(INITIAL.preset);
        presetRef.current = INITIAL.preset;
        setAutoOrbit(INITIAL.autoOrbit);
        autoOrbitRef.current = INITIAL.autoOrbit;
        angleRef.current = 0;
        framesRef.current = [];
        setMeter({ ms: 16.7, fps: 60 });
        fillTo(INITIAL.count);
        const el = readyScene();
        if (el) void el.goTo(cameraFor(INITIAL.preset, 0)).catch(() => undefined);
      }}
      controls={
        <>
          <SliderControl
            label="Tree count"
            value={count}
            min={100}
            max={MAX_TREES}
            step={100}
            format={(v) => v.toLocaleString()}
            onInput={(v) => {
              setCount(v);
              countRef.current = v;
              fillTo(v);
            }}
          />
          <SegmentedControl<CameraPreset>
            label="Camera"
            value={preset}
            options={[
              { value: "field", label: "Field" },
              { value: "canopy", label: "Canopy" },
            ]}
            onChange={(p) => {
              setPreset(p);
              presetRef.current = p;
              // While orbiting, the loop repositions from the new preset next
              // frame; when paused, ease over so the switch is still visible.
              if (!autoOrbitRef.current) {
                const el = readyScene();
                if (el) void el.goTo(cameraFor(p, angleRef.current)).catch(() => undefined);
              }
            }}
          />
          <SwitchControl label="Auto-orbit" checked={autoOrbit} onChange={setAutoOrbit} />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            A draw call is one &ldquo;draw this mesh&rdquo; order to the GPU; instancing sends one
            order for many placements. The meter over the stage plots our own requestAnimationFrame
            time — raise the count and watch how little it climbs.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="osm"
        ground="world-elevation"
        cameraPosition={`${FIELD_START.position.longitude}, ${FIELD_START.position.latitude}, ${FIELD_START.position.z}`}
        cameraHeading={FIELD_START.heading}
        cameraTilt={FIELD_START.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
      <div
        className="pointer-events-none absolute left-2 top-2 rounded-md bg-[rgba(11,14,20,0.82)] px-2 py-1 font-mono text-xs text-[rgba(226,232,240,0.9)]"
        aria-label="Live frame-time meter: rolling-average milliseconds per frame and frames per second"
      >
        {meter.ms.toFixed(1)} ms · {meter.fps.toFixed(0)} fps
      </div>
    </PlaygroundFrame>
  );
}
