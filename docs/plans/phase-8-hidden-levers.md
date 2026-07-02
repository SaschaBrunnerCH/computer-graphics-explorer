# Phase 8 — Hidden Levers (4 demos)

A re-audit of the "not possible" table after phase 7 shipped found four
rejections that no longer hold, each verified empirically on 2026-07-02:

1. `takeScreenshot({width,height})` **re-renders** at the requested resolution
   (3× shot: max edge gradient 124 vs 36 for a bilinear upscale; basemap
   labels legible) → an honest supersampling lever for **anti-aliasing**.
2. Our own `scene-shader` falsified the "no post-processing hooks" argument
   that rejected depth-of-field and motion-blur: **`RenderNode`** provides
   exactly those hooks, works even under SwiftShader, and Esri ships
   [official samples](https://developers.arcgis.com/javascript/latest/sample-code/?search=rendernodes)
   for precisely these effects —
   [color modification](https://developers.arcgis.com/javascript/latest/sample-code/custom-render-node-color/)
   (our scene-shader is this pattern),
   [**depth of field**](https://developers.arcgis.com/javascript/latest/sample-code/custom-render-node-dof/),
   [crossfade](https://developers.arcgis.com/javascript/latest/sample-code/custom-render-node-xfade/)
   (proves multi-frame FBO retention for accumulation effects), and
   [windmills](https://developers.arcgis.com/javascript/latest/sample-code/custom-render-node-windmills/)
   (custom geometry injection). `ManagedFBO.getTexture(attachment)` exposes
   the depth texture; `RenderCamera` exposes near/far/view/projection.
3. The **color-spaces** "data gap" closed: sampleserver6's `Toronto`
   ImageServer is **4-band U16** and keyless (`exportImage` with `bandIds`
   curl-verified 200), and `ImageryLayer.bandIds` is a runtime-settable
   accessor (ArcGISImageService mixin).

Re-verified as still impossible: WebGPU (no surface in v5), IBL/GI/scene-graph
/shading-models/BRDF (RenderNode is post-process injection — it can't add
lighting models, transform hierarchies, or ray queries), double-buffering,
gpu-vs-cpu, path/ray-tracing, radiosity, rendering (definitional). Same
conventions as phases 2–7 (PlaygroundFrame + shared controls, registry +
`arcgisPlaygrounds` + `demos: []` wiring, honest-controls policy,
StrictMode-safe, keyless only, live SwiftShader verification before shipping).

| # | Demo key | Companion to | Idea & honest lever |
|---|----------|--------------|---------------------|
| 1 | `aa-lab` | anti-aliasing | Two honest levers in one demo. (a) **Supersampling by screenshot**: capture the same view via `takeScreenshot` at ⅓×, 1×, and 3×-downscaled; show the three as magnified edge crops side by side — jaggies → native → SSAA-smooth, real renders all (verified re-render). (b) **A live FXAA `RenderNode` toggle** on `final-color`: the classic post-process AA shader (public-domain FXAA 3.11 reduced) running on the engine's actual frame — flip it and watch edges soften; caption is explicit that the engine already applies its own AA before this. |
| 2 | `scene-dof` | depth-of-field | A `RenderNode` on `composite-color` reading BOTH the color texture and the **depth attachment** (`getTexture(DEPTH_STENCIL_ATTACHMENT)`), following Esri's official DoF sample: linearize depth with `camera.near/far`, compute per-pixel circle of confusion, variable box/gather blur. Levers: **focus distance** + **aperture** sliders — real optics driven by the real depth buffer, over a Zurich street canyon with near/mid/far subjects. |
| 3 | `scene-motion-blur` | motion-blur | A `RenderNode` accumulation pass: `retain()` the previous frame's output FBO (the crossfade sample proves cross-frame retention), blend it with the current frame (`mix(current, history, strength)`) while an **auto-orbit** drives continuous camera motion. Levers: blur strength slider + orbit speed; stop the orbit and the smear dies — blur tied to actual motion, not a static filter. Caption distinguishes this accumulation blur from velocity-buffer motion blur used in games. |
| 4 | `false-color` | color-spaces | The Toronto 4-band (R,G,B,NIR) 16-bit ImageServer via `ImageryLayer` with runtime `bandIds`: SegmentedControl **Natural (0,1,2)** / **False-color NIR (3,0,1)** / **NIR only** — same numbers, different mapping to display primaries: a color space is a *convention*, not a property of the data. A gamma/stretch slider ties back to the sRGB-vs-linear half of the term (16-bit data → 8-bit sRGB display). Caption notes vegetation glowing red in NIR false color — the classic remote-sensing read. |

## Term data updates (all appends)

anti-aliasing → `aa-lab`; depth-of-field → `scene-dof`; motion-blur →
`scene-motion-blur`; color-spaces → `false-color`. All keys also go into
`arcgisPlaygrounds`.

## Coverage after phase 8

54 of 66 terms with an ArcGIS companion. A second re-audit pass moved five
of the remaining twelve into **phase 9 candidates** (custom-geometry
RenderNodes lit by `sunLight`: ray/path tracing, GI, BRDF, shading models —
see the [coverage report](../arcgis-companion-coverage.md)); only **6** stay
in the not-possible table.

## Risks / notes

- **scene-dof (#2)** is the hard one: correct depth linearization (reverse-Z?
  verify against the official sample) and blur cost at full resolution.
  Follow the official sample closely; degrade to not-shipping over faking.
- **scene-motion-blur (#3)**: verify `retain()` semantics across frames and
  resolution changes; guard the accumulation buffer on resize. Honest reset
  when the camera is still.
- **FXAA in #1** is a quality add-on — if it fights SwiftShader or the
  engine's own AA muddies the lesson, ship the screenshot comparison alone
  (that lever is already verified).
- **false-color (#4)**: ImageryLayer is a dynamic (exportImage) layer —
  confirm bandIds changes refetch quickly at demo extent; Toronto's band
  order (which index is NIR) must be read from the service metadata, not
  assumed.
- DoF/motion-blur move OUT of the not-possible table; the coverage report is
  updated in lockstep with this plan.
