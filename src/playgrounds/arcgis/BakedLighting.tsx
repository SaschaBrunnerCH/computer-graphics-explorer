import { useRef, useState } from "react";
import Camera from "@arcgis/core/Camera.js";
import IntegratedMeshLayer from "@arcgis/core/layers/IntegratedMeshLayer.js";
import "@arcgis/map-components/components/arcgis-scene";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SegmentedControl, SliderControl, SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * Baked lighting in the wild. The Girona photogrammetry mesh (an Esri sample
 * integrated mesh, curl-verified token-free) carries the *real* sun baked into
 * its textures: every roof shadow and dark alley was frozen into the imagery
 * the moment the city was flown. That is exactly what a game lightmap is —
 * precomputed light painted into a texture — just captured by a camera instead
 * of a renderer.
 *
 * The demo puts that frozen light next to a live one. The time-of-day slider
 * moves `environment.lighting.date` (SunLighting, same approach as the Shadows
 * and glTF playgrounds), and the "Dynamic shadows" switch toggles
 * `directShadowsEnabled` on a freshly-assigned lighting object (the reliable
 * pattern from GltfPbr). With the sun swept far from capture time, the baked
 * shadows visibly disagree with the light direction.
 */

const GIRONA_MESH_URL =
  "https://tiles.arcgis.com/tiles/z2tnIkrLQ2BRzr6P/arcgis/rest/services/Girona_Spain/SceneServer";
const GIRONA_MESH_ID = "girona-integrated-mesh";

type CameraPreset = "rooftops" | "cathedral";

const CAMERAS: Record<
  CameraPreset,
  { position: [number, number, number]; heading: number; tilt: number }
> = {
  // Down between the roofs of the old town — textured tiles and streets fill
  // the frame, so the shadows painted into each surface are unmistakable.
  rooftops: { position: [2.8264, 41.9836, 160], heading: 345, tilt: 78 },
  // Pulled back to the south-east over the old town toward the cathedral hill —
  // a contrasting vantage with long roof-to-street shadows across the skyline.
  cathedral: { position: [2.8291, 41.9838, 215], heading: 318, tilt: 70 },
};

/** Local Girona hour (UTC+2 in June, CEST) → Date for the sun position. */
const dateForHour = (hour: number): Date =>
  new Date(Date.UTC(2026, 5, 21, 0, Math.round(hour * 60) - 120));

const formatHour = (hour: number): string => {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const INITIAL = {
  hour: 13,
  shadows: false,
  preset: "rooftops" as CameraPreset,
};

export default function BakedLighting(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const [hour, setHour] = useState(INITIAL.hour);
  const [shadows, setShadows] = useState(INITIAL.shadows);
  const [preset, setPreset] = useState<CameraPreset>(INITIAL.preset);

  /** True once the view exists; all imperative access goes through this. */
  const readyScene = (): HTMLArcgisSceneElement | null => {
    const el = sceneRef.current;
    return el && el.view ? el : null;
  };

  /**
   * Assign a whole new lighting object each time (GltfPbr's reliable pattern):
   * this drives both the sun date and the dynamic-shadow toggle from one place.
   */
  const applyLighting = (el: HTMLArcgisSceneElement, h: number, s: boolean): void => {
    el.environment.lighting = {
      type: "sun",
      date: dateForHour(h),
      directShadowsEnabled: s,
    };
  };

  const goToPreset = (el: HTMLArcgisSceneElement, p: CameraPreset): void => {
    const { position, heading, tilt } = CAMERAS[p];
    const [longitude, latitude, z] = position;
    void el
      .goTo(new Camera({ position: { longitude, latitude, z }, heading, tilt }))
      .catch(() => undefined); // interrupted animations reject — never crash on that
  };

  const handleViewReady = (event: { target: HTMLArcgisSceneElement }): void => {
    const el = event.target;
    applyLighting(el, hour, shadows);
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
  };

  const caption = shadows
    ? `Sun at ${formatHour(hour)}, dynamic shadows ON. Now two shadow sets fight for the same surfaces: the ones painted into the mesh texture (frozen at capture time) and a fresh set the engine casts from the current sun. Sweep the slider and only the dynamic set moves — that overlaid double-shadow is the exact artifact game artists manage when baked lightmaps meet dynamic lights.`
    : `Sun at ${formatHour(hour)}, dynamic shadows OFF. Every shadow you see — roof onto street, deep alley, dark north-facing wall — is baked into the photogrammetry texture, captured with the real sun the day Girona was flown. Move the sun: the light direction turns but those shadows never budge. Push it far from midday and the scene looks subtly wrong — the painted shadows now disagree with where the light is coming from.`;

  return (
    <PlaygroundFrame
      title="Baked lighting: Girona's frozen sun (I3S photogrammetry)"
      caption={caption}
      onReset={() => {
        setHour(INITIAL.hour);
        setShadows(INITIAL.shadows);
        setPreset(INITIAL.preset);
        const el = readyScene();
        if (!el) return;
        applyLighting(el, INITIAL.hour, INITIAL.shadows);
        goToPreset(el, INITIAL.preset);
      }}
      controls={
        <>
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
              if (el) applyLighting(el, h, shadows);
            }}
          />
          <SwitchControl
            label="Dynamic shadows"
            checked={shadows}
            onChange={(s) => {
              setShadows(s);
              const el = readyScene();
              if (el) applyLighting(el, hour, s);
            }}
          />
          <SegmentedControl<CameraPreset>
            label="Camera"
            value={preset}
            options={[
              { value: "rooftops", label: "Rooftops" },
              { value: "cathedral", label: "Cathedral" },
            ]}
            onChange={(p) => {
              setPreset(p);
              const el = readyScene();
              if (el) goToPreset(el, p);
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Baked lighting is precomputed light stored in a texture — lightmaps in games, the
            capture-time sun in photogrammetry. It is cheap to render because nothing is recomputed
            per frame, but it is wrong the moment any light moves: the shadows stay put while the
            sun does not.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap="satellite"
        ground="world-elevation"
        cameraPosition="2.8264, 41.9836, 160"
        cameraHeading={CAMERAS.rooftops.heading}
        cameraTilt={CAMERAS.rooftops.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
    </PlaygroundFrame>
  );
}
