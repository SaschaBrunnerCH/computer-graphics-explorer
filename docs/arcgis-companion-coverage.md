# ArcGIS Companion Coverage

Status of the "every term should also have an `<arcgis-scene>` / `<arcgis-map>`
companion where it honestly fits" goal. Term links go to the deployed site.
Last updated 2026-07-02 (after the phase 6–7 feasibility pass; API claims
verified against the installed SDK v5 typings).

**50 of 66 terms** have a live ArcGIS companion —
[phase 6](plans/phase-6-mesh-material-lab.md) and
[phase 7](plans/phase-7-light-and-screen.md) **including the `scene-shader`
RenderNode stretch** all shipped 2026-07-02. A same-day re-audit
([phase 8](plans/phase-8-hidden-levers.md), planned) found four rejections
that no longer hold and takes the target to **54**; a second pass over the
remaining twelve (custom-geometry RenderNodes + `sunLight` +
`toRenderCoordinates`) reclassified **five more as feasible** (phase 9
candidates, ceiling **59–60**) and one as parked. Only **6** remain honestly
uncoverable — argued below so they aren't re-litigated.

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
| [Shader (Vertex / Fragment / Compute)](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/shader) | `scene-shader` (shipped) |
| [Frame Buffer](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/frame-buffer) | `scene-shader` (shipped) |
| [Render Pipeline](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/render-pipeline) | `scene-shader` (shipped) |

## Planned — phase 8, Hidden Levers

Found by re-auditing the rejections after `scene-shader` proved custom
post-processing works ([plan](plans/phase-8-hidden-levers.md), all levers
verified 2026-07-02):

| Term | Planned demo | Verified lever |
|---|---|---|
| [Aliasing & Anti-Aliasing (MSAA / FXAA / TAA)](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/anti-aliasing) | `aa-lab` | `takeScreenshot` re-renders at requested resolution (3× edge gradients ~3× steeper than any upscale) + FXAA RenderNode toggle |
| [Depth of Field](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/depth-of-field) | `scene-dof` | RenderNode + depth attachment — Esri ships an [official DoF sample](https://developers.arcgis.com/javascript/latest/sample-code/custom-render-node-dof/) |
| [Motion Blur](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/motion-blur) | `scene-motion-blur` | RenderNode frame accumulation (`retain()` across frames, per the crossfade sample) |
| [Color Spaces (sRGB / Linear)](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/color-spaces) | `false-color` | sampleserver6 `Toronto` is 4-band U16 **keyless**; `ImageryLayer.bandIds` is a runtime accessor |

## Phase 9 candidates — the RenderNode frontier (feasible, not yet planned)

Re-audit of 2026-07-02 (second pass): the RenderNode API is not just
post-processing — the official windmills sample injects **custom geometry
with custom shaders** into the scene (depth-tested against the real city),
`RenderNode.sunLight` hands our shaders the **engine's actual incident light
direction**, `toRenderCoordinates()` places our geometry at any lon/lat, and
retained FBOs accumulate across frames. That falsifies five more rejections:

| Term | Candidate demo | Verified lever & honest angle |
|---|---|---|
| [Ray Tracing](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/ray-tracing) | `hybrid-ray` | A fragment-shader **analytic ray tracer** (3–4 spheres: mirror reflections, shadow rays) composited against the scene's real depth buffer. The city is rasterized, the spheres are ray-traced — which is *exactly* how games ship RT (hybrid rendering); the caption teaches the boundary you can see. |
| [Path Tracing](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/path-tracing) | `scene-path-trace` | Progressive **Monte-Carlo accumulation** via retained FBOs; accumulation resets whenever the real GIS camera moves. Drag the map → noise; hold still → converge. Precisely why interactive renderers show noisy previews. |
| [Global Illumination](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/global-illumination) | `scene-path-trace` | The same demo's indirect bounces ARE global illumination — color bleeding appears out of the noise as samples accumulate. |
| [BRDF](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/brdf) | `scene-material-lab` | Our own sphere (windmills-pattern geometry injection) shaded by a **GGX BRDF we implement**, with roughness/metallic/anisotropy sliders — lit by `sunLight`, the engine's real sun. The formula finally has knobs. |
| [Shading (Flat / Gouraud / Phong)](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/shading-models) | `scene-material-lab` | Same injected sphere, the full historical spectrum — flat / Gouraud / Phong / PBR — implemented in our shaders under the real sun. The "only 2 of 4 models exist" objection dissolves once the shaders are ours. |

**Parked:** [Image-Based Lighting (IBL)](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/image-based-lighting)
— buildable on the material-lab sphere with a sun-matched procedural sky
environment, but judged marginal over the existing r3f IBL demo (which uses a
real prefiltered environment). Revisit if `scene-material-lab` ships and wants
a fourth mode.

Effort note: these are the hardest demos in the catalog (raw WebGL inside the
engine's context, ECEF local-origin precision, depth-linearization math).
Feasible ≠ cheap; schedule deliberately.

## Not possible — and what it would take

| Term | What an honest demo needs | Why it stays impossible | What would unlock it |
|---|---|---|---|
| [Rendering](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/rendering) | A lever over "producing the image" itself | Too generic to isolate — every demo on the site *is* rendering | Nothing — definitional term, not an API gap |
| [Radiosity](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/radiosity) | Patch subdivision + iterative energy transfer | *Embeddable* in principle via the same RenderNode trick as the path tracer — but it would be the 2D radiosity diagram re-rendered in a heavier costume, with zero GIS tie-in. Rejected for redundancy, not impossibility | A real GI-baking pipeline in the engine |
| [Scene Graph](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/scene-graph) | Rotate a parent, children follow | A RenderNode hierarchy would be OUR matrix stack, not the SDK's — it duplicates the r3f solar-system demo without any engine lever; graphics remain flat collections | Transform-node parenting in the graphics API |
| [Double Buffering](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/double-buffering) | Toggle buffer swap, show tearing | Swap is owned by the browser compositor, below even RenderNode | A browser swap-chain API — not Esri's to ship |
| [GPU vs CPU Rendering](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/gpu-vs-cpu-rendering) | Same map on CPU vs GPU, side by side | Exactly one render path (WebGL2); no software renderer to race | A CPU fallback renderer — abandoned industry-wide |
| [WebGL vs WebGPU](https://saschabrunnerch.github.io/computer-graphics-explorer/#/term/webgl-vs-webgpu) | Same scene on both APIs with a switch | Typings-verified: zero WebGPU surface in v5 | A WebGPU path with a runtime switch — **in development at Esri; likeliest unlock** |

Every uncovered term keeps its dedicated r3f / WebGL / diagram playground —
nothing is left untaught. Potential ceiling if phase 9 ships: **59 of 66**
(60 with the parked IBL mode). Watch item: Esri's WebGPU port (unlocks
webgl-vs-webgpu and hardware ray queries).
