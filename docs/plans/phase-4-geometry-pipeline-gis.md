# Phase 4 — Geometry, Pipeline & GIS Playgrounds (10 demos)

Covers the remaining **Geometry & Scene** and **Real-Time & GIS** terms plus the
pipeline overview. Same conventions as phase 2/3. ArcGIS demos follow the
established keyless pattern (basemap `osm`, `world-elevation`, public scene
layers — verify any new service token-free with curl before using). Do **not**
guess ArcGIS v5 APIs: confirm against the installed typings or the Map
Components reference (see DECISIONS.md for known v5 gotchas).

| # | Demo key | Terms served | Renderer | Idea |
|---|----------|--------------|----------|------|
| 1 | `mesh-inspector` | vertex, triangle-mesh, normal-vectors | r3f | One low-poly model (icosphere/torus): toggles for vertex dots, wireframe, normal arrows (`VertexNormalsHelper` or custom lines), flat ↔ smooth normals; detail slider. Serves three basics terms with one lovable inspector. |
| 2 | `mvp-matrices` | transformation-matrices | diagrams + r3f | Step-through M → V → P: sliders for model translate/rotate/scale; segmented "space" control (model/world/view/clip) that re-renders the same scene from each space's perspective, with the active 4×4 matrix shown live (highlighted changing cells). |
| 3 | `scene-graph` | scene-graph | r3f | Sun–planet–moon hierarchy; a clickable tree (plain styled list) synced with the 3D view; per-node rotation sliders demonstrate transform inheritance; "detach moon" toggle shows what reparenting does. |
| 4 | `backface-culling` | backface-culling | r3f | An open-ended cylinder + a sphere with a cutaway: culling toggle (`side: FrontSide/DoubleSide`), "flip normals" toggle, live triangles-drawn counter from `renderer.info`. See the cylinder become see-through from one side. |
| 5 | `instancing` | instancing, draw-calls-batching | r3f | 5 000 cubes: segmented "one mesh each / merged / instanced"; live draw-call count (`renderer.info.render.calls`) + fps readout. The draw-call counter collapsing from 5 000 → 1 is the money shot. |
| 6 | `pipeline-diagram` | render-pipeline, rendering, frame-buffer | diagrams (canvas/SVG) | Animated pipeline: a few triangles flow vertex-shader → raster → fragment → framebuffer; play/pause/step buttons, stage-highlight on hover with a one-liner per stage. Links each stage chip to its glossary term. Also becomes the natural `rendering` + `frame-buffer` demo. |
| 7 | `terrain-exaggeration` | terrain-rendering, elevation-exaggeration | arcgis | Alpine `<arcgis-scene>` with an exaggeration slider. v5 note: verify the current way to exaggerate ground (custom `ElevationLayer` wrapper scaling fetched tiles, as in Esri samples, if no direct property exists). Wireframe-ish "show tile edges" is out of scope unless an honest API lever exists. |
| 8 | `scene-streaming` | i3s-3d-tiles, mesh-simplification, occlusion-culling | arcgis | A large public SceneLayer (verified keyless) streaming in while flying between two presets; caption streams live `view.updating` + memory/feature stats if exposed. Explains screen-space-error-driven refinement; occlusion/HLOD explained in captions where no honest toggle exists. |
| 9 | `edge-rendering` | edge-rendering | arcgis | Buildings SceneLayer with a renderer applying `edges`: segmented none / solid / sketch, size + color controls. Verify `MeshSymbol3D`/`FillSymbol3DLayer` edges API in v5 typings; OSM buildings layer accepts a custom renderer (verify; fall back to another public layer if not). |
| 10 | `gpu-race` | gpu-vs-cpu-rendering, webgl-vs-webgpu | diagrams + webgl | Same particle/triangle workload twice: CPU canvas loop vs WebGL2, side by side with live ms/frame bars and a particle-count slider — watch the CPU lane fall over first. Caption + a small static table carry the WebGL→WebGPU story (capability comparison; no WebGPU dependency yet). |

## Term data updates

vertex + triangle-mesh + normal-vectors → `mesh-inspector`; transformation-matrices →
`mvp-matrices`; scene-graph → `scene-graph`; backface-culling → `backface-culling`;
instancing + draw-calls-batching → `instancing`; render-pipeline + rendering +
frame-buffer → `pipeline-diagram`; terrain-rendering + elevation-exaggeration →
`terrain-exaggeration`; i3s-3d-tiles + mesh-simplification + occlusion-culling →
`scene-streaming`; edge-rendering → `edge-rendering`; gpu-vs-cpu-rendering +
webgl-vs-webgpu → `gpu-race`.

After phase 4 every one of the 66 terms has a live playground or interactive
diagram. Remaining stretch ideas (not scheduled): a real WebGPU compute demo once
support is broad enough, and a picture-in-picture camera view for frustum culling.

## Risks / notes

- Phase ordering within the batch: do 1–6 (pure client) first; 7–9 need ArcGIS API
  verification time; 10 last (perf-sensitive tuning).
- `gpu-race`: cap CPU particle count so the tab never locks; run the CPU lane in
  chunked rAF work, not a blocking loop.
- ArcGIS demos: keep the honest-controls policy — if a knob isn't runtime-settable
  in v5, explain instead of faking (see ssao precedent in DECISIONS.md).
