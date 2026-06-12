import { useRef, useState } from "react";
import Camera from "@arcgis/core/Camera.js";
import "@arcgis/map-components/components/arcgis-scene";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Tile pyramids as real-world mip levels, over Bern: the OSM basemap is a
 * pyramid of pre-rendered raster tiles where each level doubles the
 * resolution of the one above — a mipmap chain in the wild. The caption maps
 * the live view scale to "tile level ≈ N" with honest log2 arithmetic, and a
 * tilted horizon preset shows one frame mixing sharp near tiles with coarse
 * far ones — the situation anisotropic filtering handles for textures.
 *
 * Keyless services only: OSM basemap + Esri world elevation.
 */

/**
 * Scale denominator of tile level 0 in the standard 256 px Web Mercator
 * tiling scheme used by the OSM basemap. Each level halves the scale, so
 * level ≈ log2(LEVEL0_SCALE / view.scale).
 */
const LEVEL0_SCALE = 591657527.591555;

type Altitude = "high" | "mid" | "low";

const CAMERAS: Record<
  Altitude,
  { position: [number, number, number]; heading: number; tilt: number }
> = {
  // The whole Bern region from 60 km up: coarse pyramid levels.
  high: { position: [7.4474, 46.948, 60000], heading: 0, tilt: 0 },
  // City scale: mid levels swap in.
  mid: { position: [7.4474, 46.94, 6000], heading: 0, tilt: 25 },
  // Over the old town: the sharpest levels of the pyramid.
  low: { position: [7.4458, 46.943, 900], heading: 15, tilt: 45 },
};

/** Low over the plateau north of Bern, looking south toward the Alps. */
const TILTED_CAMERA = { position: [7.4474, 46.975, 1500] as const, heading: 192, tilt: 82 };

const INITIAL = { altitude: "high" as Altitude, tilted: false };

export default function BasemapMips(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const lastUpdateRef = useRef(0);
  const trailingRef = useRef<number | undefined>(undefined);
  const [altitude, setAltitude] = useState<Altitude>(INITIAL.altitude);
  const [tilted, setTilted] = useState(INITIAL.tilted);
  // Live scale → tile-level readout, rounded so frames don't thrash renders.
  const [readout, setReadout] = useState<{ scale: number; level: number } | null>(null);

  /** True once the view exists; all imperative access goes through this. */
  const readyScene = (): HTMLArcgisSceneElement | null => {
    const el = sceneRef.current;
    return el && el.view ? el : null;
  };

  const goTo = (
    el: HTMLArcgisSceneElement,
    target: { position: readonly [number, number, number]; heading: number; tilt: number },
  ): void => {
    const [longitude, latitude, z] = target.position;
    void el
      .goTo(
        new Camera({
          position: { longitude, latitude, z },
          heading: target.heading,
          tilt: target.tilt,
        }),
      )
      .catch(() => undefined); // interrupted animations reject — never crash on that
  };

  /** Read the current scale off the view and publish it (deduped). */
  const updateReadout = (): void => {
    const scale = readyScene()?.view?.scale;
    if (scale == null || !Number.isFinite(scale) || scale <= 0) return;
    const roundedScale = Math.round(scale);
    const level = Math.round(Math.log2(LEVEL0_SCALE / scale) * 10) / 10;
    setReadout((prev) =>
      prev && prev.scale === roundedScale && prev.level === level
        ? prev
        : { scale: roundedScale, level },
    );
  };

  const handleViewChange = (): void => {
    // Throttle: this fires every animation frame while navigating. A trailing
    // timeout guarantees the final value lands even when the last burst of
    // events falls inside the throttle window.
    const now = performance.now();
    window.clearTimeout(trailingRef.current);
    if (now - lastUpdateRef.current >= 200) {
      lastUpdateRef.current = now;
      updateReadout();
    } else {
      trailingRef.current = window.setTimeout(() => {
        lastUpdateRef.current = performance.now();
        updateReadout();
      }, 220);
    }
  };

  const liveStats = readout
    ? `Scale 1:${readout.scale.toLocaleString("en-US")} → tile level ≈ ${readout.level.toFixed(1)} (log2 of level-0 scale ÷ current scale).`
    : "Waiting for the first frame…";

  const caption = tilted
    ? `${liveStats} In this tilted view one frame mixes levels: sharp tiles near the camera, progressively coarser ones toward the horizon. The engine picks a level per tile by its on-screen size — the same problem anisotropic filtering solves for obliquely viewed textures.`
    : `${liveStats} The basemap is a pyramid of pre-rendered tiles, each level double the resolution of the one above — a mipmap chain at planet scale. Zoom and the engine swaps in the sharper level exactly the way the GPU swaps mip levels as a texture grows on screen.`;

  return (
    <PlaygroundFrame
      title="Basemap tile pyramid over Bern"
      caption={caption}
      onReset={() => {
        setAltitude(INITIAL.altitude);
        setTilted(INITIAL.tilted);
        const el = readyScene();
        if (el) goTo(el, CAMERAS[INITIAL.altitude]);
      }}
      controls={
        <>
          <SegmentedControl<Altitude>
            label="Altitude"
            value={altitude}
            options={[
              { value: "high", label: "High" },
              { value: "mid", label: "Mid" },
              { value: "low", label: "Low" },
            ]}
            onChange={(a) => {
              setAltitude(a);
              setTilted(false);
              const el = readyScene();
              if (el) goTo(el, CAMERAS[a]);
            }}
          />
          <SwitchControl
            label="Tilted horizon view"
            checked={tilted}
            onChange={(on) => {
              setTilted(on);
              const el = readyScene();
              if (el) goTo(el, on ? TILTED_CAMERA : CAMERAS[altitude]);
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Zoom with the mouse wheel and watch the readout: a fractional level means the view sits
            between two pyramid levels. The basemap snaps to the nearest one — GPUs (with trilinear
            filtering) blend the two mips instead.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="osm"
        ground="world-elevation"
        cameraPosition="7.4474, 46.9480, 60000"
        cameraHeading={CAMERAS.high.heading}
        cameraTilt={CAMERAS.high.tilt}
        popupDisabled
        onarcgisViewChange={handleViewChange}
      />
    </PlaygroundFrame>
  );
}
