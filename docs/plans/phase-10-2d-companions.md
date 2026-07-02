# Phase 10 — More 2D: `<arcgis-map>` Companions for Scene-Only Terms (4 demos + 2 appends)

A balance pass, not a coverage pass: after phase 9 the split is 30 scenes vs
9 maps, and several scene-covered terms have an **honest 2D lever the 3D demo
doesn't show**. Phase-5's bar still applies — 2D only where it teaches
something the scene can't — and the sweep below rejected far more than it
kept. Coverage stays 59 of 66 (these terms already have scenes); what changes
is that seven more terms gain a genuine 2D perspective. All APIs verified in
the installed v5 typings (2026-07-02). Same conventions as phases 5–9,
including the `<arcgis-map>` basemap-at-creation gotcha and the two-view sync
throttling noted in the phase-5 plan.

| # | Demo key | Companion to | Idea & honest lever |
|---|----------|--------------|---------------------|
| 1 | `map-hillshade` | terrain-rendering, bump-mapping | **Hillshade is bump-mapping's exact math on real Earth**: height field → per-pixel normal → N·L shading, no geometry displaced. `RasterShadedReliefRenderer` (verified: `azimuth`, `altitude`, `zFactor`, `hillshadeType` all runtime accessors) on the keyless Terrain3D `ImageryTileLayer` (raw F32, already used by the imagery demos) over the Alps. Levers: **sun azimuth** (watch every valley's shading flip as the light circles — the classic relief-inversion illusion at south light), **sun altitude**, **z-factor** (the 2D twin of the terrain-exaggeration scene), traditional ↔ multi-directional. Captions tie azimuth/altitude to the 3D sun sliders and z-factor to displacement scaling. |
| 2 | `painters-order` | depth-buffer | **The contrast lesson: 2D maps have NO depth buffer** — visibility is layer order, the painter's algorithm the z-buffer demo's term article mentions. Three overlapping client-side GraphicsLayers (translucent shapes) with a "drawing order" SegmentedControl driving `map.layers.reorder()` (verified) — swap who paints last and occlusion flips instantly, with none of scene-zfight's flicker because there is no depth contest at all. Caption: "the scene demo above fights over a depth buffer; this map never has one — order IS visibility, which is exactly why 3D needed the z-buffer invented." |
| 3 | `map-view-transform` | transformation-matrices | mesh-transform covers the **M** of MVP; this covers the **V**, tangibly: `MapView.rotation` / scale / center are runtime-settable — sliders rotate and zoom THE VIEW while a fixed marker cross shows the world staying put. A small live 3×3 matrix readout (built from rotation/scale/center — our math, real values) makes "the camera is just another matrix, inverted" concrete. Caption: rotating the map and rotating the world are the same transform on opposite sides of V. |
| 4 | `extent-culling` | frustum-culling, camera-frustum | **The 2D frustum is the view extent.** Two maps: the main map + a locked overview beside it drawing the main view's live extent polygon (one-way watch on `view.extent`, throttled per the phase-5 sync rules). A client-side FeatureLayer of seeded points over a wide area; the caption counts how many of the N points fall inside the extent right now (point-in-extent in JS — our math, honest). Pan/zoom: the rectangle sweeps the overview and the count tracks it — spatial culling with the third dimension removed, the cousin of scene-frustum's 3D pyramid. |

## Term data updates

Appends for the new demos: terrain-rendering + bump-mapping → `map-hillshade`;
depth-buffer → `painters-order`; transformation-matrices →
`map-view-transform`; frustum-culling + camera-frustum → `extent-culling`.

**Zero-code appends of existing demos** (honest, decided in this sweep):
level-of-detail → append `tile-generalization` (tile zoom levels ARE the 2D
LOD ladder); elevation-exaggeration → append `map-hillshade` once shipped
(its z-factor is exaggeration expressed in shading). All new keys also go
into `arcgisPlaygrounds`.

## Rejected in this sweep (2D lever considered, judged dishonest or empty)

- shadows / ambient-occlusion / atmosphere / fresnel / SSR / DoF / motion-blur
  / all RenderNode terms — MapView has no shadows, no depth, no RenderNode.
- ray-casting → 2D `hitTest` is a point-in-geometry lookup, not a ray.
- instancing / draw-calls — still no honest counter in 2D.
- edge-rendering — 2D line styling is cartography, not 3D edge extraction.
- anti-aliasing — no AA lever in MapView.
- light-baking → "raster tiles are pre-baked rendering" stretches the term;
  vector-vs-raster already carries that idea under rasterization.

## Risks / notes

- `map-hillshade` (#1): confirm `RasterShadedReliefRenderer` accepts the
  Terrain3D `ImageryTileLayer` at demo zooms (the imagery demos prove raw
  F32 access; the renderer swap is the only new step). Relief inversion at
  south azimuth is a feature — caption it.
- `map-view-transform` (#3): the matrix readout is OUR arithmetic from public
  view properties — label it as illustration, not an engine dump.
- `extent-culling` (#4): rotation makes the true "extent" a rotated quad —
  either lock the main map's rotation or draw the rotated footprint honestly
  (preferred: draw the quad from the four view corners via `view.toMap`).
- After this phase the scene/map split is 30 + 13 and eleven terms carry both
  a 3D and a 2D ArcGIS perspective; coverage remains 59 of 66.
