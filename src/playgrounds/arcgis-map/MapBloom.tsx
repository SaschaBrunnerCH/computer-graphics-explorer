import { useEffect, useRef, useState } from "react";
import Graphic from "@arcgis/core/Graphic.js";
import Point from "@arcgis/core/geometry/Point.js";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import SimpleRenderer from "@arcgis/core/renderers/SimpleRenderer.js";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol.js";
import "@arcgis/map-components/components/arcgis-map";
import { PlaygroundFrame } from "../../components/PlaygroundFrame";
import { SliderControl, SwitchControl } from "../../components/controls";
import { configureArcgis } from "../../lib/arcgis";

configureArcgis();

/**
 * The 3D bloom demo's three parameters — strength, radius, threshold — on a
 * real 2D map: `layer.effect = "bloom(strength, radius, threshold)"` is the
 * Maps SDK's built-in per-layer post-process (verified grammar, e.g.
 * "bloom(1.50, 0.50px, 0.45)"). The layer is entirely client-side: ~300
 * seeded points whose "magnitude" attribute drives dot size and a warm
 * ember-to-white color ramp, so the threshold has dim and bright pixels to
 * discriminate between — the same lesson as the UnrealBloomPass demo above.
 *
 * Basemap "dark-gray" is keyless (curl-verified: the vector style JSON on
 * cdn.arcgis.com and World_Basemap_v2 tiles both answer without a token).
 */

const LAYER_ID = "bloom-points";
const POINT_COUNT = 300;
const SEED = 0x5eed_b100;

const INITIAL = { bloom: true, strength: 1.5, radius: 0.5, threshold: 0.45 };

/** Deterministic LCG in [0, 1) so every visitor sees the same constellation. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

function effectString(strength: number, radius: number, threshold: number): string {
  return `bloom(${strength.toFixed(2)}, ${radius.toFixed(2)}px, ${threshold.toFixed(2)})`;
}

/** ~300 warm dots over Europe; magnitude is squared so most stay dim embers. */
function buildLayer(): FeatureLayer {
  const rand = lcg(SEED);
  const graphics: Graphic[] = [];
  for (let i = 0; i < POINT_COUNT; i++) {
    const longitude = 9 + (rand() * 2 - 1) * 11;
    const latitude = 47 + (rand() * 2 - 1) * 6.5;
    const r = rand();
    graphics.push(
      new Graphic({
        geometry: new Point({ longitude, latitude }),
        attributes: { OBJECTID: i + 1, magnitude: r * r },
      }),
    );
  }
  return new FeatureLayer({
    id: LAYER_ID,
    title: "Glowing points",
    source: graphics,
    objectIdField: "OBJECTID",
    fields: [
      { name: "OBJECTID", type: "oid" },
      { name: "magnitude", type: "double" },
    ],
    popupEnabled: false,
    renderer: new SimpleRenderer({
      symbol: new SimpleMarkerSymbol({
        style: "circle",
        size: 6,
        color: "#ffb86b",
        outline: { color: [0, 0, 0, 0], width: 0 },
      }),
      visualVariables: [
        {
          type: "size",
          field: "magnitude",
          minDataValue: 0,
          maxDataValue: 1,
          minSize: 4,
          maxSize: 16,
        },
        {
          type: "color",
          field: "magnitude",
          stops: [
            { value: 0, color: "#8a2a00" },
            { value: 0.55, color: "#ff9a3d" },
            { value: 1, color: "#fff6d8" },
          ],
        },
      ],
    }),
  });
}

export default function MapBloom(): React.JSX.Element {
  const mapRef = useRef<HTMLArcgisMapElement | null>(null);
  const layerRef = useRef<FeatureLayer | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  const [bloom, setBloom] = useState(INITIAL.bloom);
  const [strength, setStrength] = useState(INITIAL.strength);
  const [radius, setRadius] = useState(INITIAL.radius);
  const [threshold, setThreshold] = useState(INITIAL.threshold);

  useEffect(() => () => window.clearTimeout(debounceRef.current), []);

  const applyEffect = (effect: string | null): void => {
    const layer = layerRef.current;
    if (layer) layer.effect = effect;
  };

  /** Re-running the post-process on every slider tick is wasteful — settle ~150 ms first. */
  const scheduleEffect = (s: number, r: number, t: number): void => {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => applyEffect(effectString(s, r, t)), 150);
  };

  const handleViewReady = (event: { target: HTMLArcgisMapElement }): void => {
    const el = event.target;
    if (!el.map) return;
    // StrictMode double-mounts and basemap changes can re-fire this; add once.
    const existing = el.map.findLayerById(LAYER_ID);
    if (existing instanceof FeatureLayer) {
      layerRef.current = existing;
    } else {
      const layer = buildLayer();
      layerRef.current = layer;
      el.map.add(layer);
    }
    applyEffect(bloom ? effectString(strength, radius, threshold) : null);
  };

  const caption = !bloom
    ? "Bloom off (effect = null): the brightest dots are just bright pixels — nothing spills onto neighbors. Flip it back on and the SDK bright-passes the layer, blurs it, and re-composites it every frame: a real post-process on a 2D layer."
    : threshold <= 0.05
      ? `${effectString(strength, radius, threshold)} — threshold ~0 means every dot, even the dim embers, crosses the cutoff and glows. Same over-bloom mistake as the 3D demo: glow stops meaning "bright" when everything gets it.`
      : `layer.effect = "${effectString(strength, radius, threshold)}" — the SDK's built-in per-layer post-process. Only dots brighter than the ${threshold.toFixed(2)} cutoff bloom: the near-white peaks spill light while dim embers stay crisp. Strength scales the glow, radius spreads it.`;

  return (
    <PlaygroundFrame
      title="Bloom as a map layer effect"
      caption={caption}
      onReset={() => {
        setBloom(INITIAL.bloom);
        setStrength(INITIAL.strength);
        setRadius(INITIAL.radius);
        setThreshold(INITIAL.threshold);
        window.clearTimeout(debounceRef.current);
        applyEffect(
          INITIAL.bloom ? effectString(INITIAL.strength, INITIAL.radius, INITIAL.threshold) : null,
        );
      }}
      controls={
        <>
          <SwitchControl
            label="Bloom"
            checked={bloom}
            onChange={(on) => {
              setBloom(on);
              window.clearTimeout(debounceRef.current);
              applyEffect(on ? effectString(strength, radius, threshold) : null);
            }}
          />
          <SliderControl
            label="Strength"
            value={strength}
            min={0}
            max={3}
            step={0.1}
            onInput={(v) => {
              setStrength(v);
              if (bloom) scheduleEffect(v, radius, threshold);
            }}
            format={(v) => v.toFixed(1)}
          />
          <SliderControl
            label="Radius"
            value={radius}
            min={0}
            max={2}
            step={0.05}
            onInput={(v) => {
              setRadius(v);
              if (bloom) scheduleEffect(strength, v, threshold);
            }}
            format={(v) => `${v.toFixed(2)} px`}
          />
          <SliderControl
            label="Threshold"
            value={threshold}
            min={0}
            max={1}
            step={0.05}
            onInput={(v) => {
              setThreshold(v);
              if (bloom) scheduleEffect(strength, radius, v);
            }}
            format={(v) => v.toFixed(2)}
          />
        </>
      }
    >
      <arcgis-map
        ref={mapRef}
        className="block h-full w-full"
        basemap="dark-gray"
        center="9, 47"
        zoom={5}
        popupDisabled
        onarcgisViewReadyChange={handleViewReady}
      />
    </PlaygroundFrame>
  );
}
