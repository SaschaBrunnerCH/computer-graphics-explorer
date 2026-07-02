# Phase 6 — Mesh & Material Lab (6 `<arcgis-scene>` demos)

The client-side **Mesh API** (`@arcgis/core/geometry/Mesh`) is the honest lever
this phase is built on: meshes are constructed from raw
`vertexAttributes` (position / normal / uv arrays, editable at runtime via
`vertexAttributesChanged()`), transformed with real methods
(`offset` / `rotate` / `scale` / `centerAt`), and shaded with
`MeshMaterialMetallicRoughness` (color, metallic, roughness, `colorTexture`,
`normalTexture` + texture transforms) — all verified present in the installed
v5 typings. That turns the geometry/shading basics terms — currently served
only by r3f/diagram demos — into "now build it over a real city" companions.
Same conventions as phases 2–5 (PlaygroundFrame + shared controls, registry +
`arcgisPlaygrounds` + `demos: []` wiring, honest-controls policy,
StrictMode-safe, keyless-first with curl-verified services, time-boxed agent
verification).

**Textures policy:** all textures procedural on offscreen canvases (`MeshTexture`
accepts canvas/ImageData) — no new binary assets, no network fetches.

| # | Demo key | Companion to | Idea & honest lever |
|---|----------|--------------|---------------------|
| 1 | `scene-mesh` | vertex, triangle-mesh, normal-vectors | Build a mesh **from raw arrays** floating over a city: a low-poly dome/terrain patch whose `vertexAttributes.position` and `.normal` are ours. Levers: "show vertices" toggle (small point graphics at vertex positions), flat ↔ smooth segmented control (recompute the normal array per-face vs averaged, then `vertexAttributesChanged()`), "lift center vertex" slider (edit positions live). The money shot: the same arrays the WebGL demos teach, rendered by a production GIS engine. |
| 2 | `mesh-transform` | transformation-matrices | One glTF or box mesh on a graphics layer with translate (`offset`), rotate (`rotate` about z), and scale (`scale`) sliders — each call is a real geometry transform in the SDK. Caption shows the accumulated TRS values and ties them to the M of the MVP demo above. Reset rebuilds the mesh from its stored original. |
| 3 | `scene-uv` | uv-coordinates | A quad/box mesh with a procedural checker+letters `colorTexture` and editable **uv** array: scale/offset sliders rewrite `vertexAttributes.uv` (or drive `colorTextureTransform` — verify which is runtime-cheaper), so the texture visibly stretches, tiles, and slides on real terrain backdrop. Same mental model as the UV-unwrap diagram, now on the wild side. |
| 4 | `scene-normal-map` | normal-mapping, bump-mapping | Flat mesh plane with a procedural normal map (bricks/ripples drawn to canvas, height→normal derived per pixel) on `material.normalTexture`: on/off toggle + a **sun time-of-day slider** (`<arcgis-daylight>` pattern from Shadows) so the fake relief responds to real daylight; orbit low to see the silhouette stay flat — the tell the r3f demo teaches, under a real sun. |
| 5 | `scene-albedo` | albedo, specular-vs-diffuse | A grid of spheres (`Mesh.createSphere`) with **color picker** (albedo — invariant under light), **metallic** and **roughness** sliders on `MeshMaterialMetallicRoughness`, and the sun slider: watch the specular highlight sweep and tighten while the diffuse base color stays put. Bridges the ShadingModels demo and the glTF-PBR scene. |
| 6 | `tree-instancing` | instancing, draw-calls-batching | A client-side GraphicsLayer of N identical 3D trees (WebStyleSymbol — **curl-verify the web style resources are keyless**; fall back to `ObjectSymbol3DLayer` primitives if not) with a count slider (100 → 5 000, chunked adds) and the compact rAF frame-time meter from `map-frame-budget`. Honest: count and measured frame times are ours; caption explains the engine draws repeated symbols instanced — why 5 000 trees don't cost 5 000× one tree. |

## Term data updates (all appends)

vertex + triangle-mesh + normal-vectors → `scene-mesh`;
transformation-matrices → `mesh-transform`; uv-coordinates → `scene-uv`;
normal-mapping + bump-mapping → `scene-normal-map`; albedo +
specular-vs-diffuse → `scene-albedo`; instancing + draw-calls-batching →
`tree-instancing`. All six keys also go into `arcgisPlaygrounds`.

## Risks / notes

- **Mesh API verification first**: confirm on the running app that manual
  `vertexAttributes` meshes render on a GraphicsLayer with
  `elevationInfo: relative-to-ground`, and measure `vertexAttributesChanged()`
  cost at slider rate (throttle if needed).
- **Winding/normal pitfalls** (#1): SDK meshes are single-sided — wrong winding
  makes faces vanish. That's a lesson (link backface-culling in captions), but
  the demo's defaults must be correct.
- WebStyleSymbol keylessness (#6) is the one service unknown of the phase.
- Headless verification: scene demos follow the established SwiftShader-safe
  pattern (keyless `osm`/`satellite` basemap, canvas-exists assertions only).
- Rejected for no honest lever: **scene-graph** (SDK exposes no node hierarchy),
  **tessellation** (internal triangulation, not inspectable), **shading-models**
  (the SDK has exactly one shading model — nothing to compare).
