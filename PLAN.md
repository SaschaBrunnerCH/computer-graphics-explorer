# Build Plan — Computer Graphics Explorer

Implementation plan for the spec in `docs/specs.md`. Executed autonomously; judgment calls are logged in `DECISIONS.md`.

## Milestones

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
