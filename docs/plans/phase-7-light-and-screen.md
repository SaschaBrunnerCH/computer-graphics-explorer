# Phase 7 — Light & Screen in the Wild (6 demos + 1 stretch)

The remaining lighting, geometry and screen-space terms get real-world
companions built on levers verified in the installed v5 typings: environment
lighting (`lighting.directShadowsEnabled`, sun time via the daylight pattern),
quality-profile-gated **water reflections** (screen-space, as the WaterFresnel
demo already relies on), absolute-height graphics for real depth-precision
artifacts, `geometryEngine.densify` / `geodeticDensifyOperator`,
`VectorTileLayer.currentStyleInfo` (which exposes the style's **sprite sheet**
— a production texture atlas), and — as a stretch — the public **`RenderNode`**
API (`@arcgis/core/views/3d/webgl`), whose `consumes`/`produces` slots name the
engine's actual pipeline stages (`opaque-color`, `composite-color`, `normals`,
`highlights`) and hand your shader the real framebuffer. Same conventions as
phases 2–6 (PlaygroundFrame + shared controls, registry + `arcgisPlaygrounds`
+ `demos: []` wiring, honest-controls policy, StrictMode-safe, keyless services
only, time-boxed agent verification).

| # | Demo key | Companion to | Idea & honest lever |
|---|----------|--------------|---------------------|
| 1 | `baked-lighting` | light-baking | The Girona integrated mesh (public, already used by `scene-streaming`) is a photogrammetry model whose textures carry the **real sun, baked at capture time**. Levers: sun time-of-day slider + `directShadowsEnabled` toggle. The baked shadows never move as you sweep the sun; enable dynamic shadows and they *double* — the exact artifact game artists manage when mixing baked and dynamic lights. Zero fake, maximum lesson. |
| 2 | `sun-ambient` | direct-vs-indirect-lighting | City scene at a raking sun angle: `directShadowsEnabled` toggle + time slider. Look into the shadowed façades — they're still lit, because the engine adds an ambient fill standing in for bounced light, exactly what "indirect" approximations are for. Caption is explicit that this is an approximation, not simulated bounces (honesty precedent: SSAO demo). |
| 3 | `water-ssr` | screen-space-reflections | Calm water beside a tall waterfront tower (reuse the WaterFresnel setup, `qualityProfile: "high"`). Camera preset buttons orbit until the tower leaves the frame — and its reflection **vanishes with it**: the tell that reflections are computed from what's on screen. Lever: honest view state + calm/rough toggle. Verify first on the live app that v5 water reflects geometry (not just sky) and note the SwiftShader/headless behavior for e2e. |
| 4 | `scene-zfight` | depth-buffer | Two co-planar absolute-height polygons (roof-slab red vs blue) over a city: an **elevation offset slider in centimeters** and a camera-distance preset. At 0 offset they flicker (real z-fighting in a production engine); a few cm cures it up close but not from far away — depth precision shrinking with distance, live. Verify the SDK doesn't internally bias co-planar absolute-height graphics; if it does, fall back to two overlapping extruded volumes. |
| 5 | `geodesic-densify` | tessellation | A "straight" flight path Zurich → New York on a globe-mode scene: straight lines on a globe must be **subdivided to curve**. Lever: a max-segment-length slider driving `geodeticDensifyOperator` (fallback `geometryEngine.densify`), with vertices shown as dots and a live vertex-count readout. Coarse = visibly angular chords cutting through the earth; fine = a smooth great-circle arc. Tessellation's core trade-off (more primitives ↔ smoother curves) on real geodesy. |
| 6 | `sprite-atlas` | texture-atlas | The vector basemap's icons live in one **sprite sheet** — a production texture atlas. Read `VectorTileLayer.currentStyleInfo` (style JSON + sprite URL, same keyless basemap service as `vector-raster`), render the sprite PNG beside the map, and highlight each named sprite's x/y/w/h rectangle from the sprite JSON. Lever: click a sprite entry to see its atlas rectangle; caption counts icons per single texture and explains why engines pack them (one texture bind, batched draws). |
| S | `scene-shader` (stretch) | shader, frame-buffer, render-pipeline | A custom `RenderNode` (public API, `views/3d/webgl`) consuming `composite-color`: a fragment shader over the scene's **actual framebuffer** (`ManagedFBO` color attachment) with live uniform sliders — e.g. posterize levels + edge-tint — plus a **render-slot selector** (`opaque-color` / `transparent-color` / `composite-color`) showing the engine's real pipeline stages, and a "show normals buffer" toggle if consuming `normals` proves workable. One demo, three terms: "your GLSL on a real map" (shader), "the texture your pass reads IS the framebuffer" (frame-buffer), "these named slots are the pipeline" (render-pipeline). High effort: raw WebGL2 program setup inside the SDK's context, StrictMode-safe attach/detach, SwiftShader behavior unknown — attempt only after 1–6 land, degrade to not-shipping rather than faking. |

## Term data updates (all appends)

light-baking → `baked-lighting`; direct-vs-indirect-lighting → `sun-ambient`;
screen-space-reflections → `water-ssr`; depth-buffer → `scene-zfight`;
tessellation → `geodesic-densify`; texture-atlas → `sprite-atlas`;
shader + frame-buffer + render-pipeline → `scene-shader` if the stretch lands.
All keys also go into `arcgisPlaygrounds`.

## Coverage after phases 6 + 7

47 of 66 terms with an ArcGIS companion (50 with the stretch), 31 scene +
7 map demos. The remaining ~16 terms are **honestly uncoverable** — documented
below so future sessions don't re-litigate them.

## Rejected — no honest ArcGIS lever (do not re-attempt without new API)

Every claim below was checked against the installed v5 typings (2026-07-02):
`SceneView` has no post-processing/effects property; the 3D lighting
environment is exactly `SunLighting` | `VirtualLighting`; no WebGPU surface
exists anywhere in the package. Each term keeps its dedicated
r3f/WebGL/diagram playground — nothing is left untaught.

| Term | What an honest demo needs | Why v5 can't provide it | What Esri would need to ship |
|---|---|---|---|
| rendering | A lever over "producing the image" itself | Too generic to isolate — every demo on the site *is* rendering; a dedicated one duplicates another term's demo | Nothing — definitional term, not an API gap |
| ray-tracing | Rays bouncing through the scene (reflections, refraction) | Pure rasterizer; the only ray is the pick ray, already taught by `scene-picking` on *ray-casting* | A ray-traced path (e.g. WebGPU ray queries) with a raster/RT toggle |
| path-tracing | Monte-Carlo sampling, visible noise converging over frames | No light-path sampling anywhere in the engine | A progressive path-traced "quality preview" mode with sample-count control |
| radiosity | Patch subdivision + iterative energy transfer | No surface-to-surface energy model, no inspectable intermediate state | A GI-baking pipeline exposing patches/lightmaps — unrealistic for a GIS engine |
| brdf | Sweep incident/view angles, plot the reflectance lobe | The BRDF lives inside sealed shaders; material *inputs* are settable (phase 6), the *function* is not observable | Custom material shaders or a queryable/overridable BRDF |
| global-illumination | Actual bounces: color bleeding, secondary light | Indirect light is a constant ambient term — no bounces to toggle; taught honestly as *direct-vs-indirect* (#2), calling it GI would overclaim | A dynamic GI solution (SSGI/DDGI/voxel) with a toggle |
| image-based-lighting | Swap an environment map, watch lighting change | Lighting is analytic sun + ambient only (`SunLighting`/`VirtualLighting`) | An IBL lighting type accepting an HDR/cubemap |
| shading-models | Flat vs Gouraud vs Phong vs PBR on one object | Only two material models exist (`MeshMaterial` basic, `MeshMaterialMetallicRoughness` PBR) — 2 of 4 points mis-teaches the spectrum; the basic-vs-PBR contrast already surfaces in `scene-albedo` | Legacy shading modes (unlit/lambert/phong) beside PBR — historical, won't come |
| scene-graph | Rotate a parent, children follow | Graphics are flat collections; `Mesh.components` share one transform; `GroupLayer` inherits *state* (visibility/opacity), not *transforms* — precisely the wrong lesson | Transform-node parenting in the graphics API |
| double-buffering | Toggle buffer swap, show tearing | Swap is owned by the browser compositor, below the SDK; no web app can disable vsync or tear | Nothing Esri can do — needs a browser swap-chain API |
| gpu-vs-cpu-rendering | Same map on CPU vs GPU, side by side | Exactly one render path (WebGL2); no software renderer to race — `gpu-race` works because we wrote both lanes ourselves | A CPU fallback renderer — abandoned industry-wide, won't return |
| webgl-vs-webgpu | Same scene on both APIs with a switch | Typings-verified: zero WebGPU surface in v5 | A WebGPU path with a runtime engine switch — **actively in development at Esri; the likeliest unlock, revisit each major release** |
| color-spaces | Multi-band recombination (false-color NIR) or a linear/sRGB switch | Every verified keyless imagery service is pre-rendered 8-bit RGB (multi-band services are key-gated); no color-management API | Mostly a *data* gap: a keyless multi-band sample service (`ImageryTileLayer` band support largely exists) |
| depth-of-field | Focal blur: focus distance + aperture → circle of confusion | No 3D post-processing at all; 2D `layer.effect: blur` has no focal plane/depth input — attention-steering, not optics (phase-5 rejection stands) | A SceneView post-processing stack with a depth-aware DoF pass |
| motion-blur | Velocity-buffer smear tied to camera speed | Same root cause: no post-processing hooks; `goTo` flights render each frame crisp by design | Same post-processing stack + velocity/accumulation pass |

**Not rejected, tracked elsewhere:** shader + frame-buffer + render-pipeline
(the `scene-shader` stretch above — hard, not impossible);
**anti-aliasing — parked, verify-first**: `takeScreenshot({width,height})`
*might* re-render at the requested resolution (honest supersampling: compare a
low-res nearest-upscaled shot to a high-res one). Only build it if
verification shows a true re-render, not a resample of the current
framebuffer.
