# ArcGIS Companion Coverage

Status of the "every term should also have an `<arcgis-scene>` / `<arcgis-map>`
companion where it honestly fits" goal. Term links go to the deployed site.
Last updated 2026-07-02 (after the phase 6–7 feasibility pass; API claims
verified against the installed SDK v5 typings).

**47 of 66 terms** have a live ArcGIS companion today
([phase 6](plans/phase-6-mesh-material-lab.md) and the
[phase 7](plans/phase-7-light-and-screen.md) core both shipped 2026-07-02).
The pending `scene-shader` stretch (RenderNode) would take that to **50**.
The remaining **15** are honestly uncoverable — argued in the table below so
they aren't re-litigated.

## Shipped — phase 6, Mesh & Material Lab (2026-07-02)

| Term | Planned demo |
|---|---|
| [Vertex](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/vertex) | `scene-mesh` |
| [Polygon / Triangle Mesh](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/triangle-mesh) | `scene-mesh` |
| [Normal Vectors](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/normal-vectors) | `scene-mesh` |
| [Backface Culling](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/backface-culling) | `scene-mesh` (flip-winding toggle) |
| [Transformation Matrices (Model / View / Projection)](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/transformation-matrices) | `mesh-transform` |
| [UV Coordinates](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/uv-coordinates) | `scene-uv` |
| [Normal Mapping](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/normal-mapping) | `scene-normal-map` |
| [Bump Mapping](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/bump-mapping) | `scene-normal-map` |
| [Albedo](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/albedo) | `scene-albedo` |
| [Specular vs Diffuse Reflection](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/specular-vs-diffuse) | `scene-albedo` |
| [Instancing](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/instancing) | `tree-instancing` |
| [Draw Calls & Batching](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/draw-calls-batching) | `tree-instancing` |

## Shipped — phase 7 core, Light & Screen in the Wild (2026-07-02)

| Term | Planned demo |
|---|---|
| [Light Baking & Lightmaps](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/light-baking) | `baked-lighting` |
| [Direct vs Indirect Lighting](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/direct-vs-indirect-lighting) | `sun-ambient` |
| [Screen-Space Reflections (SSR)](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/screen-space-reflections) | `water-ssr` |
| [Depth Buffer (Z-Buffer)](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/depth-buffer) | `scene-zfight` |
| [Tessellation](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/tessellation) | `geodesic-densify` |
| [Texture Atlas](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/texture-atlas) | `sprite-atlas` |
| [Shader (Vertex / Fragment / Compute)](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/shader) | `scene-shader` (stretch) |
| [Frame Buffer](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/frame-buffer) | `scene-shader` (stretch) |
| [Render Pipeline](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/render-pipeline) | `scene-shader` (stretch) |

Parked, verify-first:
[Aliasing & Anti-Aliasing (MSAA / FXAA / TAA)](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/anti-aliasing)
— honest only if `takeScreenshot({width,height})` truly re-renders at the
requested resolution (supersampling), not resamples.

## Not possible — and what it would take

| Term | What an honest demo needs | Why SDK v5 can't provide it | What Esri would need to ship |
|---|---|---|---|
| [Rendering](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/rendering) | A lever over "producing the image" itself | Too generic to isolate — every demo on the site *is* rendering | Nothing — definitional term, not an API gap |
| [Ray Tracing](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/ray-tracing) | Rays bouncing through the scene (reflections, refraction) | Pure rasterizer; the only ray is the pick ray, already taught by `scene-picking` | A ray-traced path (e.g. WebGPU ray queries) with a raster/RT toggle |
| [Path Tracing](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/path-tracing) | Monte-Carlo sampling, noise converging over frames | No light-path sampling anywhere in the engine | A progressive path-traced "quality preview" mode |
| [Radiosity](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/radiosity) | Patch subdivision + iterative energy transfer | No surface-to-surface energy model, no inspectable state | A GI-baking pipeline exposing patches/lightmaps — unrealistic for a GIS engine |
| [BRDF](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/brdf) | Sweep incident/view angles, plot the reflectance lobe | The BRDF lives inside sealed shaders — inputs settable, function not observable | Custom material shaders or a queryable BRDF |
| [Global Illumination](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/global-illumination) | Actual bounces: color bleeding, secondary light | Indirect light is a constant ambient term — no bounces to toggle | A dynamic GI solution (SSGI/DDGI/voxel) with a toggle |
| [Image-Based Lighting (IBL)](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/image-based-lighting) | Swap an environment map, watch lighting change | Lighting is analytic sun + ambient only (`SunLighting`/`VirtualLighting`) | An IBL lighting type accepting an HDR/cubemap |
| [Shading (Flat / Gouraud / Phong)](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/shading-models) | Flat vs Gouraud vs Phong vs PBR on one object | Only basic + PBR material models exist — 2 of 4 points mis-teaches the spectrum | Legacy shading modes beside PBR — historical, won't come |
| [Scene Graph](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/scene-graph) | Rotate a parent, children follow | Graphics are flat collections; `GroupLayer` inherits state, not transforms | Transform-node parenting in the graphics API |
| [Double Buffering](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/double-buffering) | Toggle buffer swap, show tearing | Swap is owned by the browser compositor, below the SDK | Nothing Esri can do — needs a browser swap-chain API |
| [GPU vs CPU Rendering](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/gpu-vs-cpu-rendering) | Same map on CPU vs GPU, side by side | Exactly one render path (WebGL2); no software renderer to race | A CPU fallback renderer — abandoned industry-wide |
| [WebGL vs WebGPU](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/webgl-vs-webgpu) | Same scene on both APIs with a switch | Typings-verified: zero WebGPU surface in v5 | A WebGPU path with a runtime switch — **in development at Esri; likeliest unlock** |
| [Color Spaces (sRGB / Linear)](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/color-spaces) | Multi-band recombination (false-color NIR) or linear/sRGB switch | Keyless imagery is pre-rendered 8-bit RGB; no color-management API | Mostly a *data* gap: a keyless multi-band sample service |
| [Depth of Field](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/depth-of-field) | Focal blur: focus distance + aperture | No 3D post-processing; 2D layer blur has no focal plane — attention, not optics | A SceneView post-processing stack with a depth-aware DoF pass |
| [Motion Blur](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/motion-blur) | Velocity-buffer smear tied to camera speed | Same root cause: no post-processing hooks; flights render crisp by design | Same post-processing stack + velocity/accumulation pass |

Every rejected term keeps its dedicated r3f / WebGL / diagram playground —
nothing is left untaught. Watch items: Esri's WebGPU port (reopens ray-tracing
and the post-processing terms) and any keyless multi-band imagery service
(unlocks color-spaces with today's API).
