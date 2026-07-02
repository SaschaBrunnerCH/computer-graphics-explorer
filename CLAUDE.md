# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Interactive glossary + playground for computer graphics concepts: 66 terms across 7 categories, each explained in plain English and (almost always) paired with live, parameterized 3D demos. Client-side only (no backend, no analytics); deployed to GitHub Pages at `/computer-graphics-explorer/`. Live: https://saschabrunnerch.github.io/computer-graphics-explorer/

## Commands

```bash
npm run dev          # dev server → http://localhost:5173/computer-graphics-explorer/
npm run build        # tsc + vite build → dist/
npm run typecheck    # tsc --noEmit (strict)
npm run lint         # eslint flat config
npm run format       # prettier --write
npm run test:e2e     # Playwright smoke tests (starts its own dev server)
```

Run a single e2e test: `npx playwright test -g "<title substring>"`. There are no unit tests — the e2e smoke suite plus the zod catalog validation are the safety net. Before a PR/commit of substance: `npm run typecheck && npm run lint && npm run build` (same gates as CI; push to `main` auto-deploys via `.github/workflows/deploy.yml`).

No API key needed — ArcGIS demos use keyless public services (basemap `osm`, `world-elevation`, public OSM 3D Buildings SceneServer) and a `VITE_ARCGIS_API_KEY` in `.env.local` only upgrades basemap options. Never introduce a demo that requires a key or fetches from non-ArcGIS networks at runtime (drei `<Environment>` presets are banned — use `RoomEnvironment`/procedural textures).

## Architecture

Four renderer flavors, on purpose — each demo uses the lowest abstraction that still shows the lesson honestly:

- `src/playgrounds/arcgis/` — `<arcgis-scene>` (3D real-world: shadows, LOD, atmosphere…)
- `src/playgrounds/arcgis-map/` — `<arcgis-map>` (2D, only where 2D has an honest lever 3D lacks: `layer.effect` bloom, `ImageryTileLayer.interpolation`, raster stretch…)
- `src/playgrounds/r3f/` — react-three-fiber (custom-shader lessons)
- `src/playgrounds/webgl/` + `diagrams/` — raw WebGL2 / canvas-SVG (pipeline fundamentals)

Data flow: `src/data/terms/<category>.ts` (one array per category, author shape `TermInput`) → merged and zod-validated in `src/data/index.ts` (unique ids, resolvable `relatedTermIds`, demo keys must exist in the registry — mistakes fail loudly at load). A term's `demos: string[]` keys into `src/playgrounds/registry.ts`, the **single registration point**, where every playground is `lazy(() => import(...))` — ArcGIS and Three.js must never land in the entry bundle. ArcGIS demo keys must *also* be added to `arcgisPlaygrounds` in registry.ts (drives the TOC shield marker).

Routing is hash-based (`#/term/<id>`) so deep links survive on Pages. Vite `base` is `/computer-graphics-explorer/` **also in dev**, so base-path bugs surface immediately. Theme/progress live in localStorage (`src/state/`); dark mode is one toggle driving both Calcite (`calcite-mode-dark`) and a Tailwind custom variant.

### Adding a term / playground

Follow `CONTRIBUTING.md`. Playground ground rules: default export, no props, built on `PlaygroundFrame` + the control wrappers in `src/components/controls.tsx` (pattern references: `r3f/ShadingModels.tsx`, `webgl/DepthBuffer.tsx`); live sliders/toggles, a caption that updates with state, working Reset, cleanup on unmount. Demos must be *honest*: no faked toggles — if the SDK can't do it (e.g. v5 removed `ambientOcclusionEnabled`), the caption says so. Standing policy: pair low-level demos with a real-world `<arcgis-scene>` companion wherever honestly possible. `DECISIONS.md` logs the judgment calls — append to it when making new ones.

## Gotchas (these cost real time)

- **ArcGIS SDK v5**: `ambientOcclusionEnabled` removed (AO automatic); `LayerView.suspended` is read-only; `ElevationTileData.values` is readonly (return a new array); terrain exaggeration = `BaseElevationLayer` subclass.
- **`<arcgis-map>`**: supply the basemap/map at element creation or no ready event ever fires. Pass basemaps as constructed instances, never set later, never shared between two views.
- **StrictMode + WebGL**: never call `loseContext()` in React cleanup — StrictMode remount reuses the canvas and permanently kills the second mount's context.
- **react-hooks v7 lint**: forbids setState-in-effect and ref writes during render.
- **Calcite v5 icons**: `IconName` is a strict union — use the derived type in `src/data/types.ts`, don't type icon names as `string`.
- **Headless WebGL**: needs SwiftShader flags (`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`) — `playwright.config.ts` sets them; browser MCP tools without those flags can't run the demos. 3D `<arcgis-scene>` won't initialize under headless SwiftShader with the `dark-gray` basemap — keyless `osm`/`satellite` work.
- **Imagery raw-pixel demos**: Terrain3D's F32 LERC tiles are the only verified keyless raw-pixel source (sampleserver imagery is pre-rendered 8-bit).

## Conventions

- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`).
- Git author for this public repo is `sascha.brunner@gmail.com` (repo-local config, already set).
- Roadmap/specs history: `docs/specs.md`, `docs/PLAN.md`, `docs/plans/` — all five phases are complete; future work is additive.
