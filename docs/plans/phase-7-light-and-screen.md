# Phase 7 — Light & Screen in the Wild (4 demos + 1 stretch)

The remaining lighting and screen-space terms get real-world companions built
on levers the SceneView genuinely exposes: environment lighting
(`lighting.directShadowsEnabled`, sun time via the daylight pattern),
quality-profile-gated **water reflections** (screen-space, as the WaterFresnel
demo already relies on), absolute-height graphics for real depth-precision
artifacts, and — as a stretch — the public **`RenderNode`** API
(`@arcgis/core/views/3d/webgl`), which injects custom WebGL passes reading the
actual framebuffer. Same conventions as phases 2–6 (PlaygroundFrame + shared
controls, registry + `arcgisPlaygrounds` + `demos: []` wiring, honest-controls
policy, StrictMode-safe, keyless services only, time-boxed agent verification).

| # | Demo key | Companion to | Idea & honest lever |
|---|----------|--------------|---------------------|
| 1 | `baked-lighting` | light-baking | The Girona integrated mesh (public, already used by `scene-streaming`) is a photogrammetry model whose textures carry the **real sun, baked at capture time**. Levers: sun time-of-day slider + `directShadowsEnabled` toggle. The baked shadows never move as you sweep the sun; enable dynamic shadows and they *double* — the exact artifact game artists manage when mixing baked and dynamic lights. Zero fake, maximum lesson. |
| 2 | `sun-ambient` | direct-vs-indirect-lighting | City scene at a raking sun angle: `directShadowsEnabled` toggle + time slider. Look into the shadowed façades — they're still lit, because the engine adds an ambient fill standing in for bounced light, exactly what "indirect" approximations are for. Caption is explicit that this is an approximation, not simulated bounces (honesty precedent: SSAO demo). |
| 3 | `water-ssr` | screen-space-reflections | Calm water beside a tall waterfront tower (reuse the WaterFresnel setup, `qualityProfile: "high"`). Camera preset buttons orbit until the tower leaves the frame — and its reflection **vanishes with it**: the tell that reflections are computed from what's on screen. Lever: honest view state + calm/rough toggle. Verify first on the live app that v5 water reflects geometry (not just sky) and note the SwiftShader/headless behavior for e2e. |
| 4 | `scene-zfight` | depth-buffer | Two co-planar absolute-height polygons (roof-slab red vs blue) over a city: an **elevation offset slider in centimeters** and a camera-distance preset. At 0 offset they flicker (real z-fighting in a production engine); a few cm cures it up close but not from far away — depth precision shrinking with distance, live. Verify the SDK doesn't internally bias co-planar absolute-height graphics; if it does, fall back to two overlapping extruded volumes. |
| S | `scene-shader` (stretch) | shader, frame-buffer | A custom `RenderNode` (public API, `views/3d/webgl`) inserted after `composite-color`: a fragment shader over the scene's **actual framebuffer** (`ManagedFBO` color attachment) with live uniform sliders — e.g. posterize levels + edge-tint. Serves `shader` ("your GLSL, running on a real map") and `frame-buffer` ("the texture your pass reads IS the framebuffer") in one demo. High effort: raw WebGL2 program setup inside the SDK's context, StrictMode-safe attach/detach, SwiftShader behavior unknown — attempt only after 1–4 land, degrade to not-shipping rather than faking. |

## Term data updates (all appends)

light-baking → `baked-lighting`; direct-vs-indirect-lighting → `sun-ambient`;
screen-space-reflections → `water-ssr`; depth-buffer → `scene-zfight`;
shader + frame-buffer → `scene-shader` if the stretch lands. All keys also go
into `arcgisPlaygrounds`.

## Coverage after phases 6 + 7

44 of 66 terms with an ArcGIS companion (46 with the stretch), 29 scene +
7 map demos. The remaining ~20 terms are **honestly uncoverable** — documented
below so future sessions don't re-litigate them.

## Rejected — no honest ArcGIS lever (do not re-attempt without new API)

- **Offline algorithms**: path-tracing, ray-tracing, radiosity, brdf — nothing
  in a rasterizing GIS engine demonstrates them; the diagrams already do.
- **Internal pipeline, not exposed**: render-pipeline, rendering,
  double-buffering, gpu-vs-cpu-rendering, webgl-vs-webgpu, anti-aliasing
  (no AA toggle), texture-atlas, draw-call counters (partially served by
  `tree-instancing` captions), global-illumination (only the ambient
  approximation of #2 — not bounces), image-based-lighting (no IBL control).
- **Rejected in phase 5, still standing**: depth-of-field / motion-blur via
  featureEffect blur (attention-steering, not optics); color-spaces (no
  verified keyless multi-band imagery for false-color composites).
- **backface-culling**: observation-only candidate (fly inside a mesh and the
  far walls stay, near ones vanish) — no toggle, and whether OSM buildings
  render single-sided is unverified; revisit only if `scene-mesh` (phase 6)
  shows a natural winding lever.
