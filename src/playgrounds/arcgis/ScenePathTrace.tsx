import { useEffect, useRef, useState } from "react";
import Camera from "@arcgis/core/Camera.js";
import Multipoint from "@arcgis/core/geometry/Multipoint.js";
import SpatialReference from "@arcgis/core/geometry/SpatialReference.js";
import SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import type SceneView from "@arcgis/core/views/SceneView.js";
import * as webgl from "@arcgis/core/views/3d/webgl.js";
import "@arcgis/map-components/components/arcgis-daylight";
import "@arcgis/map-components/components/arcgis-expand";
import "@arcgis/map-components/components/arcgis-scene";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";
import { PathTraceRenderNode, type PathTraceNode } from "./scene-path-trace/renderNode";
import {
  ELEVATION_SAMPLE_OFFSETS,
  INITIAL_CAMERA,
  INITIAL_LIGHTING,
  OSM_BUILDINGS,
  PATH_TRACE_SITE,
  TRACE_LIMITS,
  createPackedScene,
  resolveFoundationPlacement,
  siteOffsetToWgs84,
  type LocalPoint,
  type PackedAnalyticScene,
} from "./scene-path-trace/scene";

configureArcgis();

/**
 * A real external-renderer use case: architectural visualization in geographic
 * context. ArcGIS rasterizes the satellite basemap, terrain, and existing
 * surroundings. This RenderNode path-traces only three fixed-seed pavilions and
 * their terrain-fitting foundation, then depth-composites them into that
 * geographic context. The Daylight control drives the same real sun direction,
 * colour, and intensity used by both renderers.
 */

const INITIAL: Readonly<{
  enabled: boolean;
  indirectBounces: number;
  singleSample: boolean;
}> = Object.freeze({
  enabled: true,
  indirectBounces: TRACE_LIMITS.defaultIndirectBounces,
  singleSample: false,
});

const [fallbackCameraLongitude, fallbackCameraLatitude] = siteOffsetToWgs84(
  INITIAL_CAMERA.localPosition[0],
  INITIAL_CAMERA.localPosition[1],
);
const FALLBACK_CAMERA_POSITION = `${fallbackCameraLongitude}, ${fallbackCameraLatitude}, ${
  PATH_TRACE_SITE.fallbackElevationMeters + INITIAL_CAMERA.localPosition[2]
}`;

interface PreparedTraceScene {
  readonly scene: PackedAnalyticScene;
  readonly renderToLocal: Float64Array;
  readonly camera: Camera;
  readonly usedFallbackElevation: boolean;
}

type FailureKind = "setup" | "shader" | null;

const transformPoint = (matrix: Float64Array, point: LocalPoint): Float64Array =>
  new Float64Array([
    matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12],
    matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13],
    matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14],
  ]);

/** Build a float64 render→ENU matrix from ArcGIS's rigid ENU→render matrix. */
const invertLocalFrame = (localToRender: Float64Array): Float64Array | null => {
  const east = [localToRender[0], localToRender[1], localToRender[2]] as const;
  const north = [localToRender[4], localToRender[5], localToRender[6]] as const;
  const up = [localToRender[8], localToRender[9], localToRender[10]] as const;
  const origin = [localToRender[12], localToRender[13], localToRender[14]] as const;
  const squaredLengths = [
    east[0] ** 2 + east[1] ** 2 + east[2] ** 2,
    north[0] ** 2 + north[1] ** 2 + north[2] ** 2,
    up[0] ** 2 + up[1] ** 2 + up[2] ** 2,
  ];
  if (!squaredLengths.every((value) => Number.isFinite(value) && value > 1e-12)) return null;

  const e = east.map((value) => value / squaredLengths[0]);
  const n = north.map((value) => value / squaredLengths[1]);
  const u = up.map((value) => value / squaredLengths[2]);
  const dotOrigin = (axis: number[]): number =>
    axis[0] * origin[0] + axis[1] * origin[1] + axis[2] * origin[2];

  return new Float64Array([
    e[0],
    n[0],
    u[0],
    0,
    e[1],
    n[1],
    u[1],
    0,
    e[2],
    n[2],
    u[2],
    0,
    -dotOrigin(e),
    -dotOrigin(n),
    -dotOrigin(u),
    1,
  ]);
};

const queryTerrainElevations = async (
  element: HTMLArcgisSceneElement,
): Promise<{ samples: number[]; usedFallback: boolean }> => {
  const fallback = Array.from(
    { length: ELEVATION_SAMPLE_OFFSETS.length },
    () => PATH_TRACE_SITE.fallbackElevationMeters,
  );
  const ground = element.map?.ground;
  if (!ground) return { samples: fallback, usedFallback: true };

  try {
    const points = ELEVATION_SAMPLE_OFFSETS.map(({ eastMeters, northMeters }) => {
      const [longitude, latitude] = siteOffsetToWgs84(eastMeters, northMeters);
      return [longitude, latitude];
    });
    const result = await ground.queryElevation(
      new Multipoint({ points, spatialReference: SpatialReference.WGS84 }),
      { demResolution: "auto", returnSampleInfo: true },
    );
    const samples = result.geometry.points.map((point) => point[2]);
    const valid =
      samples.length === ELEVATION_SAMPLE_OFFSETS.length &&
      samples.every(Number.isFinite) &&
      result.sampleInfo?.length === ELEVATION_SAMPLE_OFFSETS.length &&
      result.sampleInfo.every(({ demResolution }) => demResolution !== -1);
    return valid ? { samples, usedFallback: false } : { samples: fallback, usedFallback: true };
  } catch {
    return { samples: fallback, usedFallback: true };
  }
};

const prepareTraceScene = async (
  element: HTMLArcgisSceneElement,
  view: SceneView,
): Promise<PreparedTraceScene> => {
  const { samples, usedFallback } = await queryTerrainElevations(element);
  const foundation = resolveFoundationPlacement(samples);
  const localToRender = webgl.renderCoordinateTransformAt(
    view,
    [PATH_TRACE_SITE.longitude, PATH_TRACE_SITE.latitude, foundation.topElevationMeters],
    SpatialReference.WGS84,
    new Float64Array(16),
  );
  if (!localToRender) throw new Error("The local render frame could not be resolved.");

  const renderToLocal = invertLocalFrame(localToRender);
  if (!renderToLocal) throw new Error("The local render frame is singular.");

  const renderCameraPosition = transformPoint(localToRender, INITIAL_CAMERA.localPosition);
  const geographicCameraPosition = new Float64Array(3);
  const cameraPosition = webgl.fromRenderCoordinates(
    view,
    renderCameraPosition,
    0,
    geographicCameraPosition,
    0,
    SpatialReference.WGS84,
    1,
  );
  if (!cameraPosition) throw new Error("The camera position could not be resolved.");

  return {
    scene: createPackedScene(foundation.thicknessMeters),
    renderToLocal,
    camera: new Camera({
      position: {
        longitude: geographicCameraPosition[0],
        latitude: geographicCameraPosition[1],
        z: geographicCameraPosition[2],
        spatialReference: SpatialReference.WGS84,
      },
      heading: INITIAL_CAMERA.heading,
      tilt: INITIAL_CAMERA.tilt,
    }),
    usedFallbackElevation: usedFallback,
  };
};

const applyInitialLighting = (element: HTMLArcgisSceneElement): void => {
  element.environment.lighting = {
    type: "sun",
    date: new Date(INITIAL_LIGHTING.dateIso),
    directShadowsEnabled: INITIAL_LIGHTING.directShadowsEnabled,
    displayUTCOffset: INITIAL_LIGHTING.utcOffsetHours,
    cameraTrackingEnabled: false,
  };
};

export default function ScenePathTrace(): React.JSX.Element {
  const sceneRef = useRef<HTMLArcgisSceneElement | null>(null);
  const nodeRef = useRef<PathTraceNode | null>(null);
  const preparedRef = useRef<PreparedTraceScene | null>(null);
  const generationRef = useRef(0);
  const [enabled, setEnabled] = useState(INITIAL.enabled);
  const [indirectBounces, setIndirectBounces] = useState(INITIAL.indirectBounces);
  const [singleSample, setSingleSample] = useState(INITIAL.singleSample);
  const [samples, setSamples] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sunBelowHorizon, setSunBelowHorizon] = useState(false);
  const [usedFallbackElevation, setUsedFallbackElevation] = useState(false);
  const [failure, setFailure] = useState<FailureKind>(null);
  const enabledRef = useRef(enabled);
  const bouncesRef = useRef(indirectBounces);
  const singleSampleRef = useRef(singleSample);

  const readyScene = (): HTMLArcgisSceneElement | null => {
    const element = sceneRef.current;
    return element?.view ? element : null;
  };

  const destroyNode = (): void => {
    const node = nodeRef.current;
    if (node && !node.destroyed) {
      node.onBroken = null;
      node.onSample = null;
      node.onSunBelowHorizon = null;
      node.destroy();
    }
    nodeRef.current = null;
  };

  const createNode = (element: HTMLArcgisSceneElement): void => {
    const prepared = preparedRef.current;
    if (!prepared || !element.view) return;
    destroyNode();
    setFailure(null);
    setSamples(1);
    const node = new PathTraceRenderNode({
      view: element.view as SceneView,
      consumes: { required: ["composite-color"] },
      produces: "composite-color",
    });
    node.scene = prepared.scene;
    node.renderToLocal = prepared.renderToLocal;
    node.indirectBounces = bouncesRef.current;
    node.singleSample = singleSampleRef.current;
    node.onBroken = () => {
      if (nodeRef.current === node) setFailure("shader");
    };
    node.onSample = (sample) => {
      if (nodeRef.current === node) setSamples(sample);
    };
    node.onSunBelowHorizon = (belowHorizon) => {
      if (nodeRef.current === node) setSunBelowHorizon(belowHorizon);
    };
    nodeRef.current = node;
    node.requestRender();
  };

  const handleViewReady = (event: { target: HTMLArcgisSceneElement }): void => {
    const element = event.target;
    const view = element.view as SceneView;
    const generation = ++generationRef.current;
    preparedRef.current = null;
    destroyNode();
    setLoading(true);
    setFailure(null);
    setSamples(1);

    if (element.map && !element.map.findLayerById(OSM_BUILDINGS.id)) {
      element.map.add(new SceneLayer(OSM_BUILDINGS));
    }
    applyInitialLighting(element);
    element.environment.atmosphereEnabled = true;

    void prepareTraceScene(element, view)
      .then((prepared) => {
        if (
          generationRef.current !== generation ||
          sceneRef.current !== element ||
          element.view !== view ||
          view.destroyed
        ) {
          return;
        }
        preparedRef.current = prepared;
        setUsedFallbackElevation(prepared.usedFallbackElevation);
        setLoading(false);
        void element.goTo(prepared.camera, { animate: false }).catch(() => undefined);
        if (enabledRef.current) createNode(element);
      })
      .catch(() => {
        if (generationRef.current !== generation || sceneRef.current !== element) return;
        setLoading(false);
        setFailure("setup");
      });
  };

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      const node = nodeRef.current;
      if (node && !node.destroyed) node.destroy();
      nodeRef.current = null;
      preparedRef.current = null;
    };
  }, []);

  const status = failure
    ? "Renderer unavailable"
    : !enabled
      ? "Path tracing off"
      : loading
        ? "Loading site…"
        : singleSample
          ? "Single sample — accumulation disabled"
          : sunBelowHorizon
            ? indirectBounces === 0
              ? "Sun below horizon — no direct sun"
              : "Sun below horizon — ambient sky only"
            : samples >= TRACE_LIMITS.maxSamplesPerPixel
              ? `Converged · ${TRACE_LIMITS.maxSamplesPerPixel} SPP`
              : `Converging · ${samples} / ${TRACE_LIMITS.maxSamplesPerPixel} SPP`;

  const terrainNote = usedFallbackElevation
    ? ` Terrain sampling was unavailable, so the documented ${PATH_TRACE_SITE.fallbackElevationMeters} m fallback anchors the foundation.`
    : "";
  const caption = failure
    ? failure === "shader"
      ? "The custom path-tracing shader is unavailable on this GPU, so the ArcGIS scene passes through untouched."
      : "The local render frame could not be prepared, so the ArcGIS scene passes through untouched."
    : !enabled
      ? "Path tracing is off: this is ArcGIS rasterizing the satellite basemap, terrain, and existing surroundings without the proposed pavilions."
      : loading
        ? "Sampling terrain at the scene anchor and four foundation corners before placing the proposal in a local east/north/up frame."
        : singleSample
          ? `One random path per pixel is intentionally shown without accumulation. The grain is Monte-Carlo variance; turn this off to watch the estimate converge.${terrainNote}`
          : sunBelowHorizon
            ? indirectBounces === 0
              ? `The selected date and time provide no direct sun, and the direct-only 0-bounce comparison deliberately samples no ambient-sky path. Raise the bounce count or choose a time when the sun is above the horizon to restore illumination.${terrainNote}`
              : `The selected date and time provide no direct sun. The proposal is therefore lit only by the restrained ambient-sky paths; choose a time when the sun is above the horizon to restore direct sun and shadows.${terrainNote}`
            : indirectBounces === 0
              ? `${samples} / ${TRACE_LIMITS.maxSamplesPerPixel} samples per pixel. This direct-only comparison uses the real ArcGIS sun and explicit shadow rays, but samples no stochastic diffuse bounce—so red and teal transfer is deliberately absent. ArcGIS still rasterizes the terrain and surroundings; they can hide the proposal through the shared depth buffer but do not participate in its light transport.${terrainNote}`
              : `${samples} / ${TRACE_LIMITS.maxSamplesPerPixel} samples per pixel. The real ArcGIS sun casts explicit shadow rays while ${indirectBounces} stochastic diffuse ${indirectBounces === 1 ? "bounce carries" : "bounces carry"} red and teal light onto the warm-white pavilion and foundation. ArcGIS still rasterizes the terrain and surroundings; they can hide the proposal through the shared depth buffer but do not participate in its secondary light paths.${terrainNote}`;

  const reset = (): void => {
    enabledRef.current = INITIAL.enabled;
    bouncesRef.current = INITIAL.indirectBounces;
    singleSampleRef.current = INITIAL.singleSample;
    setEnabled(INITIAL.enabled);
    setIndirectBounces(INITIAL.indirectBounces);
    setSingleSample(INITIAL.singleSample);
    setSamples(1);
    setSunBelowHorizon(false);
    const element = readyScene();
    if (!element) {
      setFailure(null);
      return;
    }
    applyInitialLighting(element);
    const prepared = preparedRef.current;
    if (!prepared) {
      handleViewReady({ target: element });
      return;
    }
    setFailure(null);
    setLoading(false);
    createNode(element);
    void element.goTo(prepared.camera, { animate: false }).catch(() => undefined);
  };

  return (
    <PlaygroundFrame
      title="External path tracing — architectural visualization"
      caption={caption}
      onReset={reset}
      controls={
        <>
          <SwitchControl
            label="Path tracing"
            checked={enabled}
            onChange={(on) => {
              enabledRef.current = on;
              setEnabled(on);
              setSamples(1);
              const element = readyScene();
              if (!element) return;
              if (on) createNode(element);
              else destroyNode();
            }}
          />
          <SliderControl
            label="Indirect bounces"
            value={indirectBounces}
            min={TRACE_LIMITS.minIndirectBounces}
            max={TRACE_LIMITS.maxIndirectBounces}
            step={1}
            onInput={(value) => {
              bouncesRef.current = value;
              setIndirectBounces(value);
              setSamples(1);
              const node = nodeRef.current;
              if (node && !node.destroyed) {
                node.indirectBounces = value;
                node.resetAccumulation();
              }
            }}
          />
          <SwitchControl
            label="Show single sample"
            checked={singleSample}
            onChange={(on) => {
              singleSampleRef.current = on;
              setSingleSample(on);
              setSamples(1);
              const node = nodeRef.current;
              if (node && !node.destroyed) {
                node.singleSample = on;
                node.resetAccumulation();
              }
            }}
          />
          <p className="m-0 text-xs text-[var(--calcite-color-text-3)]">
            Only the three proposed pavilions and their foundation enter traced light transport;
            RenderNode combines that path-traced image with ArcGIS&apos;s rasterized surroundings
            through the shared depth buffer, while ArcGIS also supplies the geolocated sun. Set
            indirect bounces to 0 for direct sun only, then raise it to reveal genuine diffuse
            colour transfer between the nearby buildings. The fixed-seed convex architecture is
            independently authored; the linked{" "}
            <a
              className="underline"
              href="https://www.shadertoy.com/view/wdjSDG"
              target="_blank"
              rel="noreferrer"
            >
              Shadertoy building study
            </a>{" "}
            is visual inspiration, not copied code.
          </p>
        </>
      }
    >
      <arcgis-scene
        ref={sceneRef}
        className="block h-full w-full"
        basemap={PATH_TRACE_SITE.basemap}
        ground={PATH_TRACE_SITE.ground}
        cameraPosition={FALLBACK_CAMERA_POSITION}
        cameraHeading={INITIAL_CAMERA.heading}
        cameraTilt={INITIAL_CAMERA.tilt}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      >
        <arcgis-expand
          slot="top-right"
          expandIcon="clock"
          expandTooltip="Change date and time"
          collapseTooltip="Hide daylight controls"
          mode="floating"
        >
          <arcgis-daylight
            data-testid="path-trace-daylight"
            utcOffset={INITIAL_LIGHTING.utcOffsetHours}
            hideHeader
            hidePlayButtons
            hideShadowsToggle
            hideSunLightingToggle
            onarcgisUserDateTimeChange={() => {
              setSamples(1);
              const node = nodeRef.current;
              if (node && !node.destroyed) node.resetAccumulation();
            }}
          />
        </arcgis-expand>
      </arcgis-scene>
      <div
        role="status"
        aria-label="Path-tracing status"
        data-testid="path-trace-status"
        data-samples={samples}
        className="pointer-events-none absolute bottom-8 left-3 z-10 rounded-full bg-black/75 px-3 py-1 text-xs font-medium text-white shadow"
      >
        {status}
      </div>
    </PlaygroundFrame>
  );
}
