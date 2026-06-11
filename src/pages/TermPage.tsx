import { Link, Navigate, useParams } from "react-router-dom";
import { termById, categoryById, difficultyMeta } from "../data";
import { useUnderstood, toggleUnderstood } from "../state/progress";
import { usePageMeta } from "../lib/meta";
import { DifficultyBadge } from "../components/DifficultyBadge";
import { DemoHost } from "../components/DemoHost";

import "@esri/calcite-components/components/calcite-chip";
import "@esri/calcite-components/components/calcite-notice";
import "@esri/calcite-components/components/calcite-block";
import "@esri/calcite-components/components/calcite-label";
import "@esri/calcite-components/components/calcite-switch";
import "@esri/calcite-components/components/calcite-icon";

export function TermPage(): React.JSX.Element {
  const { termId } = useParams();
  const term = termId ? termById.get(termId) : undefined;
  const understood = useUnderstood();

  usePageMeta(term?.title, term?.explanation.split(". ")[0]);

  if (!term) {
    return <Navigate to="/not-found" replace />;
  }

  const category = categoryById.get(term.category);
  const isUnderstood = understood.has(term.id);

  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-8">
      <header className="mb-6">
        <p className="mb-1 text-sm text-[var(--calcite-color-text-3)]">
          {category?.title} · <DifficultyBadge difficulty={term.difficulty} showLabel />
        </p>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="m-0 text-3xl font-bold text-[var(--calcite-color-text-1)]">
            {term.title}
          </h1>
          <calcite-label layout="inline" className="mt-2 shrink-0">
            Understood
            <calcite-switch
              checked={isUnderstood || undefined}
              oncalciteSwitchChange={() => toggleUnderstood(term.id)}
              aria-label={`Mark ${term.title} as understood`}
            />
          </calcite-label>
        </div>
        {term.synonyms.length > 0 && (
          <p className="mt-1 text-sm italic text-[var(--calcite-color-text-3)]">
            Also known as: {term.synonyms.join(", ")}
          </p>
        )}
      </header>

      <p className="text-lg leading-relaxed text-[var(--calcite-color-text-1)]">
        {term.explanation}
      </p>

      {term.analogy && (
        <calcite-notice open kind="brand" icon="lightbulb" className="my-4" width="full">
          <div slot="title">Think of it like this</div>
          <div slot="message">{term.analogy}</div>
        </calcite-notice>
      )}

      <p className="my-4 flex items-start gap-2 text-[var(--calcite-color-text-2)]">
        <calcite-icon icon="star" scale="s" className="mt-1 shrink-0" aria-hidden="true" />
        <span>
          <strong>Why it matters:</strong> {term.whyItMatters}
        </span>
      </p>

      <section aria-label="Interactive playground" className="my-8">
        <DemoHost demoKey={term.demo} />
      </section>

      {term.spotItInTheWild.length > 0 && (
        <section className="my-6">
          <h2 className="mb-2 text-xl font-semibold text-[var(--calcite-color-text-1)]">
            Spot it in the wild
          </h2>
          <ul className="m-0 list-none space-y-1 p-0">
            {term.spotItInTheWild.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[var(--calcite-color-text-2)]">
                <calcite-icon
                  icon="compass"
                  scale="s"
                  className="mt-1 shrink-0"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      {term.deeperDive && (
        <calcite-block
          heading="Go deeper"
          description="The more technical version"
          collapsible
          icon-start="graph-time-series"
          className="my-6"
        >
          <p className="leading-relaxed text-[var(--calcite-color-text-2)]">{term.deeperDive}</p>
        </calcite-block>
      )}

      {term.relatedTermIds.length > 0 && (
        <section className="my-6">
          <h2 className="mb-3 text-xl font-semibold text-[var(--calcite-color-text-1)]">
            Related terms
          </h2>
          <div className="flex flex-wrap gap-2">
            {term.relatedTermIds.map((relatedId) => {
              const related = termById.get(relatedId);
              if (!related) return null;
              return (
                <Link key={relatedId} to={`/term/${relatedId}`} className="no-underline">
                  <calcite-chip
                    icon={categoryById.get(related.category)?.icon}
                    value={relatedId}
                    label={related.title}
                  >
                    {difficultyMeta[related.difficulty].emoji} {related.title}
                  </calcite-chip>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </article>
  );
}
