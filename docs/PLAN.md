# Build Plan — Computer Graphics Explorer

Implementation plan for the spec in `docs/specs.md`. Executed autonomously; judgment calls are logged in `DECISIONS.md` (repo root).

## Roadmap — next phases

Phase 1 (everything below) is complete: 12 playgrounds live, 20 of 66 terms covered.
The remaining 46 terms are planned as three batches of 11–12 playgrounds each.
**Standing policy:** integrate `<arcgis-scene>` wherever a concept can honestly be
shown with a real-world scene — terms support multiple playgrounds, so ArcGIS
companions sit alongside low-level demos (see each plan's header).

- ✅ [Phase 2 — Shading & Light](plans/phase-2-shading-and-light.md) — **complete**: all 11 demos live (normal/bump/displacement mapping, Fresnel + ArcGIS water-Fresnel over Lake Brienz, BRDF explorer, IBL, light types + sun companion, baking, shader lab, UV unwrap); 23 playgrounds total, 33 of 66 terms covered
- ✅ [Phase 3 — Rays & Post-Processing](plans/phase-3-rays-and-post-processing.md) — **complete**: all 11 demos live (2D ray lab + ArcGIS scene-picking over Zurich, progressive path tracer, radiosity, tone mapping/HDR, bloom, DoF, motion blur, gamma, SSR, frame-time simulator); 34 playgrounds total, 47 of 66 terms covered
- ✅ [Phase 4 — Geometry, Pipeline & GIS](plans/phase-4-geometry-pipeline-gis.md) — **complete, including the synced-frustum stretch goal**: mesh inspector, MVP matrices, scene graph, backface culling, instancing, pipeline diagram, terrain exaggeration, scene streaming, edge rendering, CPU-vs-GPU race, basemap-mips, glTF-PBR, scene-frustum

- ✅ [Phase 5 — `<arcgis-map>` companions](plans/phase-5-arcgis-map.md) — **complete**: seven 2D MapView demos with honest API levers (vector-vs-raster rasterization, layer-effect bloom, imagery interpolation filtering, stretch-renderer tone mapping, real Kansas moiré, tile generalization, live frame budget)

- ✅ [Phase 6 — Mesh & Material Lab](plans/phase-6-mesh-material-lab.md) — **complete**: six `<arcgis-scene>` companions built on the client-side Mesh API — hand-built dome from raw vertex arrays (flat/smooth normals, winding/backface toggle) over Bern, S→R→T box transforms in Basel, editable-UV billboard in Geneva, procedural normal-mapped cobblestones in Lucerne, 3×3 albedo/metallic/roughness sphere grid in Lausanne, and a 3 000-tree instanced forest with live frame meter on the Zurich Allmend
- ✅ [Phase 7 — Light & Screen in the Wild](plans/phase-7-light-and-screen.md) — **complete, including the `RenderNode` stretch**: baked-vs-dynamic lighting on the Girona photogrammetry mesh, ambient-as-indirect over Zurich, the water-SSR vanish-at-frame-edge artifact, real z-fighting between co-planar slabs, geodesic densify (a flight path that cuts through the Earth), the vector basemap's real 871-icon sprite atlas, and `scene-shader` — a custom posterize RenderNode splicing user GLSL between named pipeline stages (serves shader / frame-buffer / render-pipeline); the plan doc also documents the ~15 terms with no honest ArcGIS lever

- ✅ [Phase 8 — Hidden Levers](plans/phase-8-hidden-levers.md) — **complete**: `aa-lab` (three-resolution takeScreenshot comparison + FXAA RenderNode toggle), `scene-dof` (depth-buffer-driven circle-of-confusion blur with focus/aperture sliders), `scene-motion-blur` (frame-accumulation RenderNode over an orbiting Frankfurt), `false-color` (Toronto 4-band CIR band remapping — vegetation glows red)
- ✅ [Phase 9 — The RenderNode Frontier](plans/phase-9-rendernode-frontier.md) — **complete** (IBL stretch not shipped, stays parked): `scene-material-lab` (our sphere, our flat/Gouraud/Phong/GGX shaders, lit by the engine's real sun), `hybrid-ray` (a fragment-shader ray tracer depth-composited against rasterized Zurich — reflections, shadow rays, bounce slider), `scene-path-trace` (progressive Monte-Carlo path tracing with a live SPP counter that converges while the camera holds still and resets to noise on every move; serves path-tracing + global-illumination). Key engine finding: `opaque-color` injections get erased by the downstream resolve — custom passes must target `composite-color`
- ✅ [Phase 10 — More 2D companions](plans/phase-10-2d-companions.md) — **complete, balance pass**: four `<arcgis-map>` demos giving scene-only terms an honest 2D perspective — `map-hillshade` (hillshade IS bump-mapping's math on real Earth; azimuth/altitude/z-factor), `painters-order` (2D has no depth buffer — layer order is visibility, the painter's-algorithm contrast to scene-zfight), `map-view-transform` (the V of MVP via runtime rotation/scale/center), `extent-culling` (the view extent as the 2D frustum, live on an overview map) — plus two zero-code appends (level-of-detail ← tile-generalization, elevation-exaggeration ← map-hillshade)
- 💡 [Ideas backlog](plans/ideas-backlog.md) — enrichments (emissive bloom, LineOfSight, Viewshed, ShadowCast, weather) and seven new-term candidates (voxels, point clouds, blend modes, particles, clipping planes, video textures, flow animation)

**Phases 1–10 are done — coverage is exhausted at 59 of 66**: 78 playgrounds
live, **all 66 terms covered**, 43 ArcGIS demos (30 scenes + 13 maps), with
ten terms carrying both a 3D and a 2D ArcGIS perspective. The final 6
(+1 parked IBL) have no honest ArcGIS lever — see
[arcgis-companion-coverage.md](arcgis-companion-coverage.md) for the per-term
status with live links, including the argued not-possible table (watch item:
Esri's WebGPU port).

## Milestones (phase 1)

All milestones completed (including the nice-to-have guided tour).

1. **Scaffold** ✅ — `@arcgis/create` React template merged into the repo root; full dependency set installed (ArcGIS Maps SDK v5, Calcite v5, React 19, Vite 7, three/react-three-fiber/drei, react-router-dom, fuse.js, zod, Tailwind 4, ESLint/Prettier, Playwright).
2. **Tooling** — Tailwind 4 via `@tailwindcss/vite` with dark mode synchronized to Calcite mode classes; ESLint flat config + Prettier; npm scripts (`typecheck`, `lint`, `format`, `test:e2e`); Vite `base: '/computer-graphics-explorer/'`; `.env.example`.
3. **Term data** — zod schema + typed term data split per category under `src/data/terms/`; full catalog (~60 terms, 7 categories) with explanation, why-it-matters, analogy, spot-it-in-the-wild, deeper dive, related terms.
4. **App shell** — Calcite shell with category-grouped sidebar, difficulty badges, hash routing (`createHashRouter`, GitHub Pages safe), light/dark toggle synced between Calcite and Tailwind, footer with GitHub/contribute link, per-page titles + meta/OG tags.
5. **Search & progress** — fuzzy search (fuse.js) over names/synonyms/explanations in a Cmd/Ctrl+K command palette; "understood" progress in localStorage with a sidebar indicator.
6. **Term page & PlaygroundFrame** — detail page sections, related-term chips, shareable hash deep links; shared `PlaygroundFrame` (Calcite controls panel, caption area, reset); lazy-loaded demos; friendly "coming soon" state.
7. **Three representative playgrounds** — Shadows (`<arcgis-scene>` + `<arcgis-daylight>`), Shading models (react-three-fiber), Depth buffer / z-fighting (raw WebGL2 with depth visualization).
8. **Expand to ≥10 playgrounds** — ArcGIS: atmosphere & fog, LOD, ambient occlusion/SSAO. r3f: global illumination (Cornell box), texture mapping & mipmapping, anti-aliasing, PBR materials, frustum culling. Plus interactive canvas/SVG diagrams for further terms.
9. **Smoke tests** — Playwright: home, search palette, 3 term pages (one per renderer type); software WebGL flags; assert render + no page errors.
10. **Deployment** — `.github/workflows/deploy.yml` (build-check on PRs, Pages deploy on `main`, `VITE_ARCGIS_API_KEY` secret optional); verify production build under the base path via `vite preview`.
11. **Docs** — public README (setup, architecture, add-a-term guide, full deployment guide), MIT `LICENSE`, `CONTRIBUTING.md`, complete `DECISIONS.md`.
12. **Final verification** — Definition of Done checklist from the spec.

## Architecture

```
src/
  data/            term schema (zod) + catalog, one file per category
  state/           localStorage progress, theme sync
  components/      shell, sidebar, search palette, PlaygroundFrame, shared UI
  pages/           home, term detail, not-found
  playgrounds/     one component per demo: arcgis/ | r3f/ | webgl/ | diagrams/
                   registry maps term.demoComponent → lazy import
  lib/             ArcGIS API key wiring, helpers
e2e/               Playwright smoke tests
```
