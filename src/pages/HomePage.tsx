import { Link } from "react-router-dom";
import { categories, terms, termsByCategory } from "../data";
import { useUnderstood } from "../state/progress";
import { usePageMeta } from "../lib/meta";

import "@esri/calcite-components/components/calcite-icon";
import "@esri/calcite-components/components/calcite-chip";

const playgroundCount = new Set(terms.filter((t) => t.demo).map((t) => t.demo)).size;

export function HomePage(): React.JSX.Element {
  usePageMeta(
    undefined,
    "An interactive glossary and playground for computer graphics concepts — learn shading, global illumination, PBR and more with live 3D demos.",
  );
  const understood = useUnderstood();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <section className="mb-12 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-[var(--calcite-color-brand)]">
          Welcome to the exhibit
        </p>
        <h1 className="mx-auto mt-2 max-w-2xl text-4xl font-bold leading-tight text-[var(--calcite-color-text-1)]">
          Computer graphics, one playful demo at a time
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-[var(--calcite-color-text-2)]">
          {terms.length} rendering terms explained in plain English — {playgroundCount} of them with
          live 3D playgrounds you can poke, slide, and break. Built with the ArcGIS Maps SDK,
          Three.js, and raw WebGL2.
        </p>
        <p className="mt-6 text-sm text-[var(--calcite-color-text-3)]">
          Tip: press{" "}
          <kbd className="rounded border border-[var(--calcite-color-border-1)] px-1.5 py-0.5">
            Ctrl
          </kbd>{" "}
          <kbd className="rounded border border-[var(--calcite-color-border-1)] px-1.5 py-0.5">
            K
          </kbd>{" "}
          to search from anywhere. Your progress is saved in this browser — no accounts, no cookies.
        </p>
      </section>

      <section aria-label="Categories" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => {
          const categoryTerms = termsByCategory.get(category.id) ?? [];
          const done = categoryTerms.filter((t) => understood.has(t.id)).length;
          const demos = categoryTerms.filter((t) => t.demo).length;
          const firstTerm = categoryTerms[0];
          return (
            <Link
              key={category.id}
              to={firstTerm ? `/term/${firstTerm.id}` : "/"}
              className="group block rounded-xl border border-[var(--calcite-color-border-2)] bg-[var(--calcite-color-foreground-1)] p-5 no-underline shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <div className="mb-2 flex items-center gap-2">
                <calcite-icon
                  icon={category.icon}
                  scale="m"
                  aria-hidden="true"
                  style={{ color: "var(--calcite-color-brand)" }}
                />
                <h2 className="m-0 text-lg font-semibold text-[var(--calcite-color-text-1)] group-hover:text-[var(--calcite-color-brand)]">
                  {category.title}
                </h2>
              </div>
              <p className="m-0 text-sm text-[var(--calcite-color-text-2)]">{category.tagline}</p>
              <p className="mb-0 mt-3 text-xs text-[var(--calcite-color-text-3)]">
                {categoryTerms.length} terms · {demos} with playgrounds
                {done > 0 && ` · ${done} understood ✓`}
              </p>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
