# Ideas Backlog — mined from the official samples gallery & API reference

A sweep of [sample-code](https://developers.arcgis.com/javascript/latest/sample-code/)
and the [core reference](https://developers.arcgis.com/javascript/latest/references/core/)
(2026-07-02), cross-checked against the installed v5 typings — every API named
below exists locally. Not scheduled; this is the idea shelf phases 9+ draw from.

## Enrichments for already-covered terms (small, high value)

| Existing term/demo | Idea | Verified API |
|---|---|---|
| bloom (`map-bloom`) | 3D companion: light-emitting spheres at dusk — `emissiveColor`/`emissiveStrength` on mesh materials (the "Light-emitting symbols" sample) | `MeshMaterialMetallicRoughness.emissiveColor/-Strength/-Texture` |
| ray-casting (`scene-picking`) | `LineOfSightAnalysis`: a literal 3D ray from observer to target with the **occlusion hit point rendered by the engine** — ray casting drawn in the wild | `analysis/LineOfSightAnalysis` |
| occlusion-culling (`scene-streaming`) | `ViewshedAnalysis`: visibility-from-a-point over real terrain — thousands of occlusion tests painted onto the city | `analysis/ViewshedAnalysis` |
| shadow-mapping (`shadows`) | `ShadowCastAnalysis`: cumulative shadow accumulation over a day — shadow maps integrated over time | `analysis/ShadowCastAnalysis` |
| atmosphere-fog (`atmosphere-fog`) | `environment.weather`: cloudy/foggy/rainy/snowy — volumetric clouds + fog density levers | `SceneView.environment.weather` (4 weather classes) |

## New-term candidates (the glossary can grow past 66)

Concepts the ArcGIS platform demonstrates *natively* — each would ship with a
real-world demo on day one, plus the usual r3f/diagram low-level twin:

| New term candidate | Why it's a real graphics concept | Native ArcGIS demo lever |
|---|---|---|
| Volume rendering & voxels | Direct volume rendering, isosurfaces, transfer functions | `VoxelLayer`: runtime `renderMode` (volume ↔ surfaces), isosurface value, **dynamic section planes** |
| Point clouds & splatting | Point-based rendering, density/size trade-offs | `PointCloudLayer`: point size, density, renderer toggles |
| Alpha blending & blend modes | Compositing math (multiply/screen/overlay) — core raster ops | `layer.blendMode` (BlendLayer mixin), runtime-settable, 2D + 3D |
| Particle systems | The classic real-time effect category | `environment.weather` snow/rain ARE GPU particles over a real city |
| Clipping planes | Geometry clipped by a plane — cousin of near/far clip | `SliceAnalysis`/`SlicePlane`: drag a real clipping plane through buildings |
| Video textures | Texture streams updated per frame | `MediaLayer` with video element georeferenced onto the map; `MeshTexture` also accepts video |
| GPU animation (flow) | Time-driven vertex/fragment animation | `FlowRenderer` animated streamlines (wind/current data), with visual variables |

## Notes

- New terms mean catalog work (explanations, analogies, related-term links),
  not just demos — budget accordingly; CONTRIBUTING.md documents the shape.
- Everything above is keyless-verifiable in principle but each service still
  needs the usual curl check before building (voxel/point-cloud/flow demos
  need public sample services — the samples gallery lists their item URLs).
- Phase 9 (RenderNode frontier: hybrid-ray, scene-path-trace,
  scene-material-lab) remains the priority queue ahead of this shelf — it
  closes existing terms before the catalog grows.
