# Phase 5 — `<arcgis-map>` Companions (7 demos)

2D MapViews demonstrate several graphics concepts with **honest, runtime API
levers** that the 3D scenes can't offer (layer effects, imagery interpolation,
raster-function stretches, vector-vs-raster tiles). All seven are **companions**
appended to terms that already have a low-level demo — the "now see it on a real
map" panel. Same conventions as phases 2–4 (PlaygroundFrame + shared controls,
registry + `demos: []` wiring, honest-controls policy, StrictMode-safe,
time-boxed agent verification). New element: `<arcgis-map>` from
`@arcgis/map-components/components/arcgis-map` — same patterns as the scenes
(`onarcgisViewReadyChange`, `element.view` is a `MapView`), keys go into
`arcgisPlaygrounds` for the TOC shield.

**Service policy:** keyless only, curl-verified (`?f=json` without token).
Prefer client-side sources (seeded graphics) over services where possible.
Where a needed service has no keyless option, degrade or drop honestly —
never fake.

| # | Demo key | Companion to | Idea & honest lever |
|---|----------|--------------|---------------------|
| 1 | `vector-raster` | rasterization | Two synced MapViews (or one map + basemap toggle): a **vector tile** basemap vs a **raster tile** basemap over the same area. Zoom to a fractional level: vector linework re-rasterizes crisply every frame, raster tiles blur (they're pre-baked pixels). Lever: zoom + basemap choice. Verify a keyless vector source (candidate: the OpenStreetMap_v2 VectorTileServer on basemaps.arcgis.com — curl it; if only key-gated vector basemaps exist, use the key when present and show a friendly notice without it). |
| 2 | `map-bloom` | bloom | MapView **layer effects** support literal `bloom(strength, radius, threshold)` — the same three parameters as the 3D UnrealBloomPass demo above it. Dark gray-canvas basemap + a client-side FeatureLayer of seeded glowing points (no service). Three sliders mirror the 3D demo 1:1; threshold misuse lesson carries over. |
| 3 | `imagery-filtering` | texture-filtering, mipmapping | `ImageryTileLayer.interpolation` is runtime-settable: **nearest / bilinear / cubic**. Zoom deep into real imagery/elevation pixels and flip modes — blocky vs smooth on actual Earth data. Needs a keyless ImageServer (curl-verify candidates: sampleserver6 imagery, AGOL-hosted public imagery tile services); if none works keyless, degrade with notice. |
| 4 | `imagery-tone` | tone-mapping, hdr, gamma-correction | Satellite sensors capture 11–16 bits; displays show 8 — the imagery **stretch** is tone mapping in production. One ImageryTileLayer with a raster-function or rendering-rule stretch: min/max (or % clip) sliders + a **gamma** slider. Captions tie each control back to the post-processing terms. Same service caveat as #3; verify which stretch mechanism (rasterFunction vs renderer) is runtime-settable in v5. |
| 5 | `map-moire` | moire-patterns | Real moiré: imagery basemap over Kansas center-pivot irrigation fields (regular circular grids); zoom slider sweeping fractional scales + a **rotation** slider — interference bands appear/swim at specific scale/angle combinations. Lever: honest view state only. |
| 6 | `tile-generalization` | mesh-simplification | Cartographic generalization = mesh simplification's 2D cousin: the same coastline/road network at two zooms **side by side** (two MapViews, same center, zoom N and N−3, synced panning). Vertices visibly drop on the coarse view. Use the vector source from #1. |
| 7 | `map-frame-budget` | frame-rate | A client-side layer with a "Point count" slider (1k–100k seeded graphics) over a dark basemap, plus an **auto-pan/orbit toggle** driving continuous redraws, while our own rAF monitor (reuse the FrameTime graph pattern, compact) plots real frame times. Honest: we do the measuring; the map does real work. |

## Term data updates (all appends)

rasterization → append `vector-raster`; bloom → append `map-bloom`;
texture-filtering + mipmapping → append `imagery-filtering`; tone-mapping +
hdr + gamma-correction → append `imagery-tone`; moire-patterns → append
`map-moire`; mesh-simplification → append `tile-generalization`; frame-rate →
append `map-frame-budget`.

## Risks / notes

- **Imagery services are the big unknown** (#3, #4): public keyless ImageServers
  exist (sampleserver6, AGOL-hosted) but capabilities differ (interpolation
  support, raster functions, bit depth). Verification before building is
  mandatory; honest degradation (notice + key-unlocked path) if needed.
- Two-MapView demos (#1, #6) must throttle their sync (watch center/zoom one-way
  or debounced two-way with a guard flag) to avoid feedback loops.
- 100k client-side graphics (#7) should be generated in chunks to keep load
  responsive; cap defaults modest on mobile.
- Rejected for no honest lever: draw-call/batching counters, texture atlas
  internals, AA toggles, double buffering, "DoF" via featureEffect blur
  (attention-steering, not optics).
