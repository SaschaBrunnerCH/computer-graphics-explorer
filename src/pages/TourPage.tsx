import { Link, Navigate, useParams } from "react-router-dom";
import { termById } from "../data";
import { pipelineTour } from "../data/tours";
import { usePageMeta } from "../lib/meta";
import { TermArticle } from "../components/TermArticle";

import "@esri/calcite-components/components/calcite-button";
import "@esri/calcite-components/components/calcite-notice";

export function TourPage(): React.JSX.Element {
  const { stepIndex } = useParams();
  const index = Number(stepIndex ?? "1") - 1;
  const step = pipelineTour.steps[index];
  const term = step ? termById.get(step.termId) : undefined;

  usePageMeta(
    step ? `${pipelineTour.title} — step ${index + 1}` : pipelineTour.title,
    pipelineTour.description,
  );

  if (!step || !term) {
    return <Navigate to="/tour/1" replace />;
  }

  const total = pipelineTour.steps.length;
  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <header className="mb-6 rounded-xl border border-[var(--calcite-color-border-2)] bg-[var(--calcite-color-foreground-1)] p-4">
        <p className="m-0 text-sm font-semibold uppercase tracking-widest text-[var(--calcite-color-brand)]">
          {pipelineTour.title} · step {index + 1} of {total}
        </p>
        <p className="mb-2 mt-1 text-[var(--calcite-color-text-2)]">{step.blurb}</p>
        <div
          className="flex items-center gap-1"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={index + 1}
          aria-label="Tour progress"
        >
          {pipelineTour.steps.map((s, i) => (
            <Link
              key={s.termId}
              to={`/tour/${i + 1}`}
              aria-label={`Step ${i + 1}: ${termById.get(s.termId)?.title}`}
              className={
                "h-2 flex-1 rounded-full transition-colors " +
                (i <= index
                  ? "bg-[var(--calcite-color-brand)]"
                  : "bg-[var(--calcite-color-border-2)]")
              }
            />
          ))}
        </div>
      </header>

      <TermArticle term={term} />

      <nav className="mt-8 flex items-center justify-between gap-4" aria-label="Tour navigation">
        {isFirst ? (
          <span />
        ) : (
          <Link to={`/tour/${index}`} className="no-underline">
            <calcite-button appearance="outline" kind="neutral" icon-start="chevron-left">
              Previous stop
            </calcite-button>
          </Link>
        )}
        {isLast ? (
          <Link to="/" className="no-underline">
            <calcite-button kind="brand" icon-end="check-circle">
              Finish the tour
            </calcite-button>
          </Link>
        ) : (
          <Link to={`/tour/${index + 2}`} className="no-underline">
            <calcite-button kind="brand" icon-end="chevron-right">
              Next stop
            </calcite-button>
          </Link>
        )}
      </nav>
    </div>
  );
}
