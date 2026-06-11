# Contributing

Thanks for wanting to make Computer Graphics Explorer better! The most valuable
contributions are exactly the ones the site is made of: **a new term** or **a new
playground**. Both are small, well-defined changes.

## Setup

```bash
npm ci
npm run dev        # http://localhost:5173/computer-graphics-explorer/
```

No API key needed for development — ArcGIS demos fall back to keyless services
(see the README if you want one anyway).

## Adding a term

1. Pick the right category file in `src/data/terms/` (one file per category).
2. Add a new object to the array. The shape is enforced by the zod schema in
   `src/data/types.ts`:
   - `id` — kebab-case slug, becomes the URL (`#/term/<id>`)
   - `explanation` — 2–4 beginner-friendly sentences, no unexplained jargon
   - `whyItMatters` — one line connecting it to real applications
   - `analogy` — an everyday analogy (optional but encouraged)
   - `spotItInTheWild` — 2–3 short bullets (games / maps / movies)
   - `deeperDive` — the more technical paragraph (optional)
   - `relatedTermIds` — 2–5 ids of existing terms
3. Run `npm run dev` — the catalog is validated on load (unique ids, resolvable
   related-term links), so mistakes fail loudly.

## Adding a playground

1. Create a component under `src/playgrounds/{arcgis|r3f|webgl|diagrams}/`.
   Default export, no props. Build it on the shared `PlaygroundFrame`
   (`src/components/PlaygroundFrame.tsx`) and the control wrappers in
   `src/components/controls.tsx` so it matches the other demos — look at
   `r3f/ShadingModels.tsx` or `webgl/DepthBuffer.tsx` for the pattern.
2. Register it in `src/playgrounds/registry.ts` with `lazy(() => import(...))`
   (one line). Lazy loading is mandatory — ArcGIS and Three.js must not land in
   the entry bundle.
3. Point a term at it: add your key to the term's `demos: ["<your-key>"]` array.
   Several terms may share one demo, and one term may show several playgrounds —
   many pair a low-level demo with a real-world `<arcgis-scene>` companion.
4. Ground rules: live and parameterized (sliders/toggles that change rendering
   in real time), a one-line caption that updates with state, a working Reset,
   cleanup on unmount, no network fetches beyond the ArcGIS services, and it
   must work without an API key.

## Before opening a PR

```bash
npm run typecheck && npm run lint && npm run build
npm run test:e2e   # Playwright smoke tests
```

The same checks run in CI on every pull request. Conventional Commits
(`feat:`, `fix:`, `docs:`, `chore:`) are appreciated.
