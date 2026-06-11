# Prompt for Claude Code: "Computer Graphics Explorer" — Interactive 3D Rendering Learning Platform

**How to run:** Save this file as `SPEC.md` in an empty git repo (with the GitHub remote already set up). Then start Claude Code from the repo root:

```bash
# Fully autonomous (recommended inside a sandbox/container, never as root):
claude --dangerously-skip-permissions "Read SPEC.md and implement it completely, end to end. Follow the Autonomous Execution rules in the spec."

# Safer middle ground (auto-applies file edits, still confirms bash commands):
claude --permission-mode acceptEdits "Read SPEC.md and implement it completely, end to end."
```

Copy everything below this line into Claude Code (or save as `SPEC.md` in an empty repo and tell Claude Code to implement it).

---

## Context & Motivation

I work alongside computer graphics professionals and constantly encounter 3D rendering terminology I don't fully understand — shading, global illumination, PBR, ambient occlusion, and so on. I want an interactive learning platform where I can look up these terms, browse them in a structured way, and most importantly **play with live 3D demos** that make each concept tangible.

This starts as a personal project, but it is meant to **go public**: an open-source site that other developers, GIS folks, and graphics newcomers can learn from too. Build it to that standard — polished enough to share, welcoming to strangers, and easy for others to contribute to.

I am a Product Engineer working with the **ArcGIS Maps SDK for JavaScript** (3D / SceneView), so wherever a concept can be demonstrated with real-world 3D scenes (terrain, cities, atmosphere), use the ArcGIS Maps SDK. Where a concept needs lower-level control (custom shaders, ray tracing visualizations, BRDF plots), use **Three.js (react-three-fiber)**, or **raw WebGL2/WebGPU** for pipeline fundamentals.

## Goal

Build a **modern web application** called **Computer Graphics Explorer**: an interactive, playful glossary and playground for computer graphics concepts. Every term gets:

1. A short, beginner-friendly explanation (2–4 sentences, no jargon without links)
2. A "why it matters" line connecting it to what I see in real applications
3. An **interactive playground** with sliders/toggles that change the rendering live
4. Cross-links to related terms

## Tech Stack

- **Scaffold the project with [`@arcgis/create`](https://www.npmjs.com/package/@arcgis/create)** — run `npm init @arcgis` (or `npx @arcgis/create -- -n computer-graphics-explorer -t react`) and pick the **React template**. This sets the project up the way Esri recommends for the JS Maps SDK. Build the rest of the app on top of that scaffold rather than a generic Vite starter
- **React + TypeScript** (strict mode), as provided by the scaffold
- **ArcGIS Maps SDK for JavaScript via Map Components** — use the web components from [`@arcgis/map-components`](https://developers.arcgis.com/javascript/latest/references/map-components/), in particular [`<arcgis-scene>`](https://developers.arcgis.com/javascript/latest/references/map-components/components/arcgis-scene/) for all 3D scene demos, plus companion components (`<arcgis-daylight>`, `<arcgis-weather>`, `<arcgis-zoom>`, etc.) where they fit. Drop down to `@arcgis/core` APIs only when a setting isn't exposed by the components (e.g. fine-grained environment/lighting properties via the component's underlying view)
- **[Calcite Design System](https://developers.arcgis.com/calcite-design-system/components/)** (`@calcite-components`) as the primary UI component library — use Calcite components for app chrome and controls (sliders, switches, panels, chips, navigation, modals, notices, the search/command palette). It's Esri's design system, pairs natively with Map Components, and gives consistent light/dark theming via Calcite mode classes
- **Tailwind CSS** only for layout and custom styling where Calcite doesn't reach — make sure Tailwind's preflight/reset and Calcite theming coexist cleanly and dark mode is synchronized between the two
- **Three.js via [react-three-fiber](https://docs.pmnd.rs/react-three-fiber)** as the default for low-level / custom-shader demos — r3f's declarative component model fits the one-component-per-playground architecture (add `@react-three/drei` for helpers). For the handful of **pipeline-fundamentals demos where abstraction would hide the lesson** (e.g. rasterization, depth buffer / z-fighting, what a draw call is), use **raw WebGL2 or WebGPU** instead, so the real pipeline is visible with nothing in between
- Client-side only, no backend. Deployable as static site (GitHub Pages compatible)
- Use lazy loading / code splitting per demo so the initial bundle stays small (ArcGIS and Three.js demos must not both load upfront)

## Core Features

### 1. Glossary / Table of Contents
- Sidebar with all terms grouped by category (see catalog below)
- Each term shows a difficulty badge: 🟢 Basics / 🟡 Intermediate / 🔴 Advanced
- Progress indicator: mark terms as "understood" (persisted in localStorage)

### 2. Search
- Instant fuzzy search across term names, synonyms, and explanation text
- Keyboard shortcut (Cmd/Ctrl+K) opens a command-palette-style search

### 3. Term Detail Page
Each term page contains:
- **Plain-English explanation** with a simple analogy where possible
- **Interactive playground** (the heart of the app — see below)
- **"Spot it in the wild"**: where this concept appears in games/maps/movies
- **Related terms** chips linking to other pages
- Optional "Go deeper" collapsible section with the more technical version

### 4. Interactive Playgrounds
Every playground must be **live and parameterized** — sliders, toggles, and presets that change the rendering in real time, with a one-line caption explaining what just changed. Examples of what I expect:

- **Shading models**: a sphere/teapot rendered side-by-side with flat, Gouraud, Phong, and PBR shading; slider for light position (react-three-fiber)
- **Global illumination**: toggle between direct-only and direct+indirect lighting; a simple Cornell-box style scene showing color bleeding (react-three-fiber; can be precomputed/faked if real-time GI is too heavy)
- **Shadows**: `<arcgis-scene>` of a city (e.g., Zurich) with the `<arcgis-daylight>` component for sun position/time-of-day showing real shadow casting; explain shadow maps, soft shadows, peter-panning artifacts with exaggerated toggle states
- **Atmosphere & fog**: `<arcgis-scene>` with atmosphere quality toggle, fog, and sky models over alpine terrain
- **Level of Detail (LOD)**: `<arcgis-scene>` zooming on terrain/mesh layers, with an overlay visualizing LOD switching; explain screen-space error
- **Texture mapping & mipmapping**: react-three-fiber plane with mipmapping on/off, anisotropic filtering slider — show the shimmering artifact
- **Anti-aliasing**: zoomable comparison of no AA / MSAA / FXAA-style smoothing on hard edges
- **Ambient occlusion**: SSAO on/off toggle in a scene with crevices (the SDK supports SSAO via the scene environment — use it through the `<arcgis-scene>` component; fall back to Three.js if needed)
- **PBR materials**: metalness/roughness sliders on a sphere grid (react-three-fiber), plus a real glTF mesh in an `<arcgis-scene>`
- **Depth buffer / z-fighting**: raw WebGL2 demo — deliberately create z-fighting and let me fix it with a near/far plane slider; show the actual depth buffer contents as a grayscale overlay
- **Frustum culling**: top-down debug view showing the camera frustum and which objects get culled as I move the camera

If a real-time demo is infeasible, use an animated/interactive SVG or canvas diagram instead — but never a static image alone.

### 5. Guided Tours (nice-to-have)
A "Rendering Pipeline 101" tour that walks through vertex processing → rasterization → fragment shading → output merging, stepping through the relevant terms in order.

## Term Catalog (initial scope — organize and extend sensibly)

**Rendering Fundamentals** 🟢: rendering, rasterization, ray tracing, ray casting, render pipeline, frame buffer, depth buffer (z-buffer), double buffering, frame rate / frame time, GPU vs CPU rendering

**Geometry & Scene** 🟢/🟡: vertex, polygon/triangle mesh, normal vectors, scene graph, transformation matrices (model/view/projection), camera frustum, frustum culling, backface culling, level of detail (LOD), tessellation, instancing

**Shading & Materials** 🟡: shading (flat/Gouraud/Phong), shader (vertex/fragment/compute), BRDF, physically based rendering (PBR), metalness/roughness workflow, albedo, specular vs diffuse reflection, Fresnel effect, normal mapping, bump mapping, displacement mapping

**Lighting** 🟡/🔴: direct vs indirect lighting, global illumination, radiosity, path tracing, ambient occlusion (and SSAO), light types (directional/point/spot/area), image-based lighting (IBL), light baking / lightmaps, shadows & shadow mapping, soft vs hard shadows

**Textures & Sampling** 🟡: texture mapping, UV coordinates, mipmapping, texture filtering (nearest/bilinear/trilinear/anisotropic), texture atlas, aliasing & anti-aliasing (MSAA, FXAA, TAA), moiré patterns

**Post-Processing & Effects** 🟡: tone mapping, HDR, bloom, depth of field, motion blur, screen-space reflections, gamma correction, color spaces (sRGB/linear)

**Real-Time & GIS-Specific** 🟡: WebGL vs WebGPU, draw calls & batching, occlusion culling, terrain rendering, elevation exaggeration, atmosphere rendering, mesh simplification, I3S / 3D Tiles streaming, edge rendering / sketch rendering (ArcGIS-specific)

## UX & Tone Requirements

- **Playful and illustrative** — friendly microcopy, smooth transitions, satisfying interactions. This should feel like an explorable museum exhibit, not documentation
- Explanations in **English**, written for a smart non-graphics-expert. Define every term before using it, or link it
- Mobile-friendly layout (playgrounds may show a "best on desktop" hint)
- Accessible: keyboard navigation, reduced-motion respect, sufficient contrast
- **Public-ready**: every term page has a shareable deep link; sensible page titles and meta/OG tags so links unfurl nicely when shared; a footer with a GitHub link ("found a mistake or want to add a term? Contribute!"); progress tracking stays per-visitor in localStorage

## Implementation Guidance

- Define terms as typed data (`terms.ts` or JSON + zod schema): id, title, synonyms, category, difficulty, explanation, deeperDive, relatedTermIds, demoComponent
- One React component per playground, lazy-loaded; a shared `PlaygroundFrame` with controls panel, caption area, and reset button — build its controls from Calcite components (`calcite-slider`, `calcite-switch`, `calcite-segmented-control`, `calcite-button`, etc.) so all playgrounds feel consistent
- For ArcGIS demos: build on **Map Components** — declare scenes with `<arcgis-scene>` and configure via component attributes/properties; access the underlying `view` from the component only when you need imperative control (lighting, environment, SSAO, atmosphere). Use public Esri basemaps/layers, and consult the current Map Components reference rather than guessing — do not fall back to the legacy imperative `new SceneView(...)` pattern
- Keep each demo self-contained and disposable (clean up views/renderers on unmount)
- Write a short README with setup, architecture overview, and how to add a new term + playground

## Deployment: GitHub Pages

- Create a **GitHub Actions workflow** (`.github/workflows/deploy.yml`) that builds the app and deploys it to **GitHub Pages** on every push to `main`
- Use the official Pages actions flow: `actions/checkout` → setup Node with dependency caching → `npm ci` → `npm run build` → `actions/upload-pages-artifact` → `actions/deploy-pages`, with the required `pages: write` / `id-token: write` permissions and a `github-pages` environment
- **Inject the ArcGIS API key at build time** from a repository secret: pass `VITE_ARCGIS_API_KEY: ${{ secrets.VITE_ARCGIS_API_KEY }}` as an env var to the build step. The workflow must not fail if the secret is missing (graceful degradation as specified above)
- **README must include a step-by-step deployment setup guide**: (1) how to create an ArcGIS API key in the ArcGIS Location Platform / developer dashboard and which privileges/scopes the demos need (basemaps, scene layers), (2) how to add it as a GitHub Actions repository secret named `VITE_ARCGIS_API_KEY` (Settings → Secrets and variables → Actions), (3) how to set it locally in `.env.local`, (4) how to enable GitHub Pages (Source: GitHub Actions), and (5) a note that Vite bakes the key into the public client bundle — so the key should be restricted by HTTP referrer to the Pages URL in the ArcGIS dashboard
- Configure the build for project-page hosting: set the correct base path (e.g. Vite `base: '/<repo-name>/'`) so assets, lazy-loaded demo chunks, and ArcGIS/Calcite assets resolve correctly under the subpath
- Client-side routing must survive deep links and refreshes on Pages — use hash-based routing, or include a `404.html` SPA fallback
- Add a build-check job (typecheck + lint + build) that also runs on pull requests, so broken builds never reach `main`
- Document in the README how to enable Pages in the repo settings (Source: GitHub Actions) and where the published URL will be

## Autonomous Execution — read this first

You (Claude Code) must complete this project **end to end without asking me any questions**. All decisions you might normally ask about are pre-answered below. If something genuinely ambiguous comes up, make the most sensible choice, keep going, and log it in a `DECISIONS.md` file with a one-line rationale — I will review that file afterwards.

**Pre-answered decisions:**
- Project/repo name: `computer-graphics-explorer`; package manager: **npm**; Node: current LTS; license: MIT
- **ArcGIS API key: I will provide it.** Read it from an environment variable (`VITE_ARCGIS_API_KEY`) — locally via a git-ignored `.env.local`, in CI via a GitHub Actions secret. Never hardcode or commit the key; add `.env*` to `.gitignore` (allow `.env.example` with a placeholder). The app must also degrade gracefully when no key is set (fall back to keyless basemaps/layers where possible, or show a friendly "API key required for this demo" notice) so the dev server runs without it. Do not block on the key — build everything, wire up the key plumbing, and I will drop the key in
- No analytics, no cookies, no backend, no external services beyond CDN-free npm dependencies
- **Open-source readiness**: add a `LICENSE` (MIT) and a short `CONTRIBUTING.md` explaining how to add a new term + playground (the typed term data makes this a small, well-defined contribution). Write the README for a stranger discovering the repo, not just for me
- Scope for the first complete run: glossary with the **full term catalog**, search, progress tracking, and **at least 10 working playgrounds** covering all three renderer types (`<arcgis-scene>`, react-three-fiber, raw WebGL2). Remaining terms may launch with explanation + diagram and a "playground coming soon" state — but never an empty page
- Guided tour is nice-to-have: build it only if everything else is done and verified

**Verify your own work — you are the reviewer:**
- After each milestone run `npm run build`, typecheck, and lint; fix all errors before moving on
- Add a minimal **Playwright smoke test** that starts the dev server, visits the home page, the search, and 3 term pages (one per renderer type), and asserts they render without console errors. Run it before declaring the project done. WebGL in headless browsers can be flaky — use software rendering flags (`--use-gl=swiftshader` / `--enable-unsafe-swiftshader`) and treat "canvas exists and no page errors" as sufficient; do not pixel-test renders
- Validate the production build locally (`vite preview`) with the GitHub Pages base path before finishing

**Git workflow:**
- Work directly in the current repo. Commit incrementally with Conventional Commits (`feat:`, `fix:`, `chore:`); one logical change per commit
- Include the `Co-authored-by: Claude <noreply@anthropic.com>` trailer on commits
- Do **not** push and do not create releases — I will review and push myself. Everything must be ready so that my first push to `main` triggers the Pages deployment successfully

**Definition of Done (check every item before stopping):**
1. `npm ci && npm run build` succeeds from a clean checkout
2. Typecheck + lint pass; Playwright smoke test passes
3. All catalog terms have pages with explanations; ≥10 interactive playgrounds work
4. `.github/workflows/deploy.yml` exists and is valid (build job mirrors local build exactly)
5. Production build works under the `/computer-graphics-explorer/` base path, including lazy-loaded chunks and ArcGIS/Calcite assets
6. README (written for the public), `LICENSE`, and `CONTRIBUTING.md` exist; README covers setup, architecture, adding a new term + playground, and the full deployment guide (API key creation, GitHub secret, `.env.local`, enabling GitHub Pages)
7. `DECISIONS.md` lists every judgment call you made

## Working Style

- Scaffold with `npx @arcgis/create -- -n computer-graphics-explorer -t react` (non-interactive), then write a short build plan to `PLAN.md` and execute it — do not wait for confirmation
- Build iteratively: scaffold + glossary + search first, then 3 representative playgrounds (one `<arcgis-scene>`, one react-three-fiber, one raw WebGL2) to establish the `PlaygroundFrame` pattern, then expand to the rest
- TypeScript strict, ESLint + Prettier, meaningful commits