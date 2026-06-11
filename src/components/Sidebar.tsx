import { NavLink } from "react-router-dom";
import { categories, termsByCategory } from "../data";
import { useUnderstood } from "../state/progress";
import { arcgisPlaygrounds } from "../playgrounds/registry";
import { DifficultyBadge } from "./DifficultyBadge";
import arcgisSdkLogo from "../assets/arcgis-sdk-js.svg";

import "@esri/calcite-components/components/calcite-accordion";
import "@esri/calcite-components/components/calcite-accordion-item";
import "@esri/calcite-components/components/calcite-icon";

function PlaygroundMarker({ demo }: { demo: string | undefined }): React.JSX.Element | null {
  if (!demo) return null;
  if (arcgisPlaygrounds.has(demo)) {
    return (
      <img
        src={arcgisSdkLogo}
        alt=""
        title="ArcGIS Maps SDK playground"
        aria-label="Has an ArcGIS Maps SDK playground"
        className="h-3.5 w-3.5 shrink-0"
      />
    );
  }
  return (
    <calcite-icon
      icon="play"
      scale="s"
      title="Interactive playground"
      aria-label="Has an interactive playground"
      style={{ color: "var(--calcite-color-brand)" }}
    />
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }): React.JSX.Element {
  const understood = useUnderstood();

  return (
    <nav aria-label="Glossary" className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto pb-2">
        <calcite-accordion selection-mode="multiple" scale="m">
          {categories.map((category) => {
            const terms = termsByCategory.get(category.id) ?? [];
            const done = terms.filter((t) => understood.has(t.id)).length;
            return (
              <calcite-accordion-item
                key={category.id}
                heading={category.title}
                description={`${done}/${terms.length} understood`}
                icon-start={category.icon}
                expanded={done < terms.length || undefined}
              >
                <ul className="m-0 list-none p-0">
                  {terms.map((term) => (
                    <li key={term.id}>
                      <NavLink
                        to={`/term/${term.id}`}
                        onClick={onNavigate}
                        className={({ isActive }) =>
                          `flex items-center gap-2 px-4 py-1.5 text-sm no-underline transition-colors ` +
                          `text-[var(--calcite-color-text-2)] hover:bg-[var(--calcite-color-foreground-2)] ` +
                          (isActive
                            ? "bg-[var(--calcite-color-foreground-3)] font-semibold text-[var(--calcite-color-text-1)]"
                            : "")
                        }
                      >
                        <DifficultyBadge difficulty={term.difficulty} />
                        <span className="min-w-0 flex-1 truncate">{term.title}</span>
                        <PlaygroundMarker demo={term.demo} />
                        {understood.has(term.id) && (
                          <calcite-icon
                            icon="check-circle"
                            scale="s"
                            aria-label="Understood"
                            style={{ color: "var(--calcite-color-status-success)" }}
                          />
                        )}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </calcite-accordion-item>
            );
          })}
        </calcite-accordion>
      </div>
      <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--calcite-color-border-3)] px-4 py-2 text-xs text-[var(--calcite-color-text-3)]">
        <span className="inline-flex items-center gap-1">
          <calcite-icon
            icon="play"
            scale="s"
            aria-hidden="true"
            style={{ color: "var(--calcite-color-brand)" }}
          />
          playground
        </span>
        <span className="inline-flex items-center gap-1">
          <img src={arcgisSdkLogo} alt="" className="h-3.5 w-3.5" />
          ArcGIS scene
        </span>
        <span className="inline-flex items-center gap-1">
          <calcite-icon
            icon="check-circle"
            scale="s"
            aria-hidden="true"
            style={{ color: "var(--calcite-color-status-success)" }}
          />
          understood
        </span>
      </p>
    </nav>
  );
}
