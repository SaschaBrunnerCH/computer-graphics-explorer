import type { ReactNode } from "react";

import "@esri/calcite-components/components/calcite-button";
import "@esri/calcite-components/components/calcite-icon";

/**
 * Shared chrome for every playground: stage (canvas/scene), a Calcite
 * controls panel, a live caption explaining the current state, and reset.
 * Keeping this consistent is what makes the demos feel like one exhibit.
 */
export function PlaygroundFrame({
  title,
  caption,
  onReset,
  controls,
  children,
  stageHeight = 420,
}: {
  title: string;
  /** One line describing what the current settings show — update it on every change. */
  caption: string;
  onReset: () => void;
  controls: ReactNode;
  children: ReactNode;
  stageHeight?: number;
}): React.JSX.Element {
  return (
    <figure className="m-0 overflow-hidden rounded-xl border border-[var(--calcite-color-border-2)] bg-[var(--calcite-color-foreground-1)] shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--calcite-color-border-3)] px-4 py-2">
        <p className="m-0 flex items-center gap-2 text-sm font-semibold text-[var(--calcite-color-text-1)]">
          <calcite-icon icon="play" scale="s" aria-hidden="true" />
          {title}
        </p>
        <calcite-button
          appearance="transparent"
          kind="neutral"
          scale="s"
          icon-start="reset"
          onClick={onReset}
        >
          Reset
        </calcite-button>
      </div>

      <div className="flex flex-col md:flex-row">
        <div
          className="relative min-w-0 flex-1 bg-[var(--calcite-color-foreground-2)]"
          style={{ height: stageHeight }}
        >
          {children}
        </div>
        <aside
          className="w-full shrink-0 overflow-y-auto border-t border-[var(--calcite-color-border-3)] p-4 md:w-72 md:border-l md:border-t-0"
          style={{ maxHeight: stageHeight }}
          aria-label="Playground controls"
        >
          <div className="flex flex-col gap-4">{controls}</div>
        </aside>
      </div>

      <figcaption
        aria-live="polite"
        className="border-t border-[var(--calcite-color-border-3)] bg-[var(--calcite-color-foreground-2)] px-4 py-2 text-sm text-[var(--calcite-color-text-2)]"
      >
        {caption}
      </figcaption>
    </figure>
  );
}
