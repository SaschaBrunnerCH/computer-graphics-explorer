# Decisions Log

Judgment calls made during the autonomous build, per the spec's Autonomous Execution rules.

- **Scaffold merge**: the repo root was not empty (README, `docs/specs.md`), and `@arcgis/create` only scaffolds into a new directory — scaffolded into a temp dir and merged into the root, keeping `docs/`.
- **Removed `@arcgis/charts-components`**: the template ships it, but this app has no charts; removing it also resolved the only `npm audit` findings (moderate, in its transitive `ajv`).
- **Git author**: per the owner's choice, repo-local git config uses `sascha.brunner@gmail.com` (personal address for the public repo) instead of the globally configured work address.
- **Vite `base` is always `/computer-graphics-explorer/`**: also in dev, so base-path bugs (assets, lazy chunks, worker URLs) surface immediately instead of only on Pages. Hash routing makes deep links work regardless.
- **Tailwind 4 (CSS-first)**: used the current Tailwind major with `@tailwindcss/vite`; dark mode is driven by a custom variant bound to Calcite's `calcite-mode-dark` class so one toggle controls both systems.
- **Term data split per category**: instead of one giant `terms.ts`, one file per category under `src/data/terms/` — smaller diffs for contributors adding a term; all files are merged and zod-validated in `src/data/index.ts`.
