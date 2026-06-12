import { useEffect, useRef, useState } from "react";
import Camera from "@arcgis/core/Camera.js";
import { watch } from "@arcgis/core/core/reactiveUtils.js";
import IntegratedMeshLayer from "@arcgis/core/layers/IntegratedMeshLayer.js";
import "@arcgis/map-components/components/arcgis-scene";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * I3S streaming made visible: the photogrammetry mesh of Girona (an Esri
 * sample integrated mesh, curl-verified token-free) is a tree of mesh chunks.
 * The engine walks that tree and refines each node only until its geometric
 * error projects below a screen-space threshold, so flying closer triggers
 * waves of downloads — exactly the moment this demo points a camera at.
 *
 * Honest readouts (verified in @arcgis/core v5 typings):
 * - `View.updating` (read-only accessor) → live "streaming…/idle" status via
 *   `reactiveUtils.watch`.
 * - `SceneView.performanceInfo` (experimental debug API, but real) →
 *   `usedMemory` plus the mesh layer's own memory from
 *   `layerPerformanceInfos`, polled once a second.
 * A "pause streaming" toggle is NOT possible (`LayerView.suspended` is
 * read-only), so none is offered.
 */

const GIRONA_MESH_URL =
  "https://tiles.arcgis.com/tiles/z2tnIkrLQ2BRzr6P/arcgis/rest/services/Girona_Spain/SceneServer";
const GIRONA_MESH_ID = "girona-integrated-mesh";

type FlyPreset = "far" | "close";

const CAMERAS: Record<
  FlyPreset,
  { position: [number, number, number]; heading: number; tilt: number }
> = {
  // The whole city from the south — only coarse tree levels are needed.
  far: { position: [2.8255, 41.963, 2000], heading: 0, tilt: 50 },
  // Down between the roofs of the old town — the deepest nodes must stream in.
  close: { position: [2.8264, 41.9836, 160], heading: 345, tilt: 78 },
};

const INITIAL = { preset: "far" as FlyPreset };

const MB = 1024 * 1024;

export default function SceneStreaming(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const updatingWatchRef = useRef<{ remove(): void } | null>(null);
  const [preset, setPreset] = useState<FlyPreset>(INITIAL.preset);
  const [updating, setUpdating] = useState(true);
  // Memory readout in MB, polled from the experimental performanceInfo API.
  const [memory, setMemory] = useState<{ used: number; mesh: number } | null>(null);
  const [altitude, setAltitude] = useState<number | null>(null);

  /** True once the view exists; all imperative access goes through this. */
  const readyScene = (): HTMLArcgisSceneElement | null => {
    const el = sceneRef.current;
    return el && el.view ? el : null;
  };

  // Poll memory stats once a second; the watch handle is released on unmount.
  useEffect(() => {
    const interval = setInterval(() => {
      const view = readyScene()?.view;
      if (!view) return;
      const info = view.performanceInfo;
      const meshInfo = info.layerPerformanceInfos.find(
        (entry) => entry.layer?.id === GIRONA_MESH_ID,
      );
      const used = Math.round(info.usedMemory / MB);
      const mesh = Math.round((meshInfo?.memory ?? 0) / MB);
      setMemory((prev) =>
        prev && prev.used === used && prev.mesh === mesh ? prev : { used, mesh },
      );
    }, 1000);
    return () => {
      clearInterval(interval);
      updatingWatchRef.current?.remove();
      updatingWatchRef.current = null;
    };
  }, []);

  const goToPreset = (el: HTMLArcgisSceneElement, p: FlyPreset): void => {
    const { position, heading, tilt } = CAMERAS[p];
    const [longitude, latitude, z] = position;
    void el
      .goTo(new Camera({ position: { longitude, latitude, z }, heading, tilt }))
      .catch(() => undefined); // interrupted animations reject — never crash on that
  };

  const handleViewReady = (event: { target: HTMLArcgisSceneElement }): void => {
    const el = event.target;
    // StrictMode double-mounts can re-fire this; add the layer only once.
    if (el.map && !el.map.findLayerById(GIRONA_MESH_ID)) {
      el.map.add(
        new IntegratedMeshLayer({
          id: GIRONA_MESH_ID,
          url: GIRONA_MESH_URL,
          title: "Girona integrated mesh",
        }),
      );
    }
    // Live streaming status from View.updating (verified read-only accessor).
    updatingWatchRef.current?.remove();
    updatingWatchRef.current = watch(
      () => el.view?.updating ?? false,
      (value) => setUpdating(value),
      { initial: true },
    );
  };

  const handleViewChange = (event: { target: HTMLArcgisSceneElement }): void => {
    const z = event.target.view?.camera?.position.z;
    if (z == null) return;
    const alt = Math.round(z / 10) * 10;
    setAltitude((prev) => (prev === alt ? prev : alt));
  };

  const status = updating
    ? "Streaming — nodes are downloading and decoding…"
    : "Idle — everything in view has refined to its target detail.";
  const stats = [
    altitude != null ? `camera ≈ ${altitude.toLocaleString("en-US")} m` : null,
    memory ? `scene memory ≈ ${memory.used} MB (mesh ≈ ${memory.mesh} MB)` : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");

  const caption = `${status}${stats ? ` Live: ${stats}.` : ""} An I3S scene layer is a tree of mesh chunks refined by screen-space error: distant blocks keep simplified, low-triangle versions, and chunks that can't reach your screen — hidden interiors, the far side of the hill — are simply never requested.`;

  return (
    <PlaygroundFrame
      title="Streaming the Girona photogrammetry mesh (I3S)"
      caption={caption}
      onReset={() => {
        setPreset(INITIAL.preset);
        const el = readyScene();
        if (el) goToPreset(el, INITIAL.preset);
      }}
      controls={
        <>
          <SegmentedControl<FlyPreset>
            label="Fly to"
            value={preset}
            options={[
              { value: "far", label: "Far overview" },
              { value: "close", label: "Close street" },
            ]}
            onChange={(p) => {
              setPreset(p);
              const el = readyScene();
              if (el) goToPreset(el, p);
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Fly Far → Close and watch the blur sharpen in waves: each wave is a deeper level of the
            chunk tree arriving. The same idea powers I3S and 3D Tiles alike. Memory figures come
            from <code>view.performanceInfo</code>, an experimental debug API.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="osm"
        ground="world-elevation"
        cameraPosition="2.8255, 41.9630, 2000"
        cameraHeading={CAMERAS.far.heading}
        cameraTilt={CAMERAS.far.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
        onarcgisViewChange={handleViewChange}
      />
    </PlaygroundFrame>
  );
}
