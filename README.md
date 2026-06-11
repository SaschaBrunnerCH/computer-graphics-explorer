# Computer Graphics Explorer

**An interactive glossary and playground for computer graphics concepts.**
66 rendering terms — shading, global illumination, PBR, ambient occlusion,
z-fighting, and friends — explained in plain English, most importantly with
**live 3D demos** you can poke, slide, and break.

🌐 **Live site:** https://saschabrunnerch.github.io/computer-graphics-explorer/

Built with three renderers, on purpose:

- **ArcGIS Maps SDK for JavaScript** (`<arcgis-scene>` map components) for
  real-world 3D — city shadows, atmosphere, terrain LOD, SSAO
- **Three.js via react-three-fiber** for custom-shader lessons — shading
  models, PBR material grids, Cornell-box color bleeding, texture filtering
- **Raw WebGL2 / canvas** for pipeline fundamentals where any abstraction
  would hide the lesson — the depth buffer, rasterization itself

UI is the [Calcite Design System](https://developers.arcgis.com/calcite-design-system/)
with Tailwind for layout. Client-side only — no backend, no analytics, no
cookies; your reading progress lives in your browser's localStorage.

## Quick start

```bash
git clone https://github.com/SaschaBrunnerCH/computer-graphics-explorer.git
cd computer-graphics-explorer
npm ci
npm run dev        # → http://localhost:5173/computer-graphics-explorer/
```

That's it. **No API key required** — the ArcGIS demos use keyless public
services and degrade gracefully. Adding a key (below) is optional for premium
basemaps.

| Script              | What it does                            |
| ------------------- | --------------------------------------- |
| `npm run dev`       | Dev server with HMR                     |
| `npm run build`     | Typecheck + production build to `dist/` |
| `npm run preview`   | Serve the production build locally      |
| `npm run typecheck` | TypeScript strict, no emit              |
| `npm run lint`      | ESLint (flat config)                    |
| `npm run format`    | Prettier                                |
| `npm run test:e2e`  | Playwright smoke tests (software WebGL) |

## Architecture

```
src/
  data/             the term catalog — typed, zod-validated
    types.ts        term schema (id, explanation, analogy, demo key, …)
    terms/          one file per category (66 terms, 7 categories)
    index.ts        merge + referential-integrity validation
  components/       app shell, sidebar, Cmd/Ctrl+K search palette,
                    PlaygroundFrame (shared demo chrome) + control wrappers
  pages/            home, term detail, 404
  playgrounds/      one component per demo, lazy-loaded
    registry.ts     demo key → lazy import (the only registration point)
    arcgis/         <arcgis-scene> demos
    r3f/            react-three-fiber demos
    webgl/          raw WebGL2 demos
    diagrams/       interactive canvas/SVG diagrams
  state/            localStorage progress + theme (Calcite ↔ Tailwind dark mode)
  lib/              ArcGIS API key wiring, page metadata
e2e/                Playwright smoke tests
```

Key decisions (the full log is in [`DECISIONS.md`](DECISIONS.md)):

- **Hash routing** so every term has a shareable deep link that survives
  refreshes on GitHub Pages with no 404 fallback tricks.
- **Lazy loading per demo** — ArcGIS and Three.js never load upfront, and
  never together unless you visit both kinds of pages.
- **Typed term data** — adding a term is editing one array entry; the zod
  schema and id-integrity checks fail loudly on mistakes.

### Adding a term or playground

See [`CONTRIBUTING.md`](CONTRIBUTING.md) — both are small, well-defined
changes (a data entry, or a component + one registry line).

## Deployment (GitHub Pages)

Deployment is automated: every push to `main` runs
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
(typecheck → lint → build → deploy to Pages). Pull requests run the same
build checks without deploying. One-time setup:

### 1. Create an ArcGIS API key (optional but recommended)

1. Sign in at the [ArcGIS Location Platform](https://location.arcgis.com/)
   (free tier is fine) and open **API keys** in the dashboard.
2. Create a key and grant it the **Basemaps** privilege (covers the basemap
   styles service) and — if you use private scene layers — the relevant item
   access. The demos in this repo only need basemaps; the 3D buildings,
   elevation, and scene layers they use are public.
3. **Restrict the key by HTTP referrer.** Vite bakes the key into the public
   client bundle, so anyone can read it — referrer restriction is what keeps
   it yours. Add:
   - `https://saschabrunnerch.github.io` (production)
   - `http://localhost:5173` and `http://localhost:4173` (dev + preview)

### 2. Add the key as a GitHub Actions secret

Repo → **Settings → Secrets and variables → Actions → New repository secret**

- Name: `VITE_ARCGIS_API_KEY`
- Value: the key from step 1

The workflow passes it to the build as an env var. **If the secret is
missing, the build still succeeds** — the app falls back to keyless services.

### 3. Set the key locally

```bash
cp .env.example .env.local     # then paste the key after the =
```

`.env*` is git-ignored (only `.env.example` is committed). Never commit a key.

### 4. Enable GitHub Pages

Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.

After the next push to `main`, the site publishes to
`https://<user>.github.io/computer-graphics-explorer/`.

> The Vite `base` is set to `/computer-graphics-explorer/` so assets and
> lazy-loaded chunks resolve under the project subpath. If you fork under a
> different repo name, change `base` in `vite.config.ts` accordingly.

## Contributing

Found a mistake, or want to add a term or playground? Contributions are very
welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

[MIT](LICENSE)
