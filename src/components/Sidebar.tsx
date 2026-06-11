import { NavLink } from "react-router-dom";
import { categories, termsByCategory } from "../data";
import { useUnderstood } from "../state/progress";
import { DifficultyBadge } from "./DifficultyBadge";

import "@esri/calcite-components/components/calcite-accordion";
import "@esri/calcite-components/components/calcite-accordion-item";
import "@esri/calcite-components/components/calcite-icon";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }): React.JSX.Element {
  const understood = useUnderstood();

  return (
    <nav aria-label="Glossary" className="h-full overflow-y-auto pb-6">
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
    </nav>
  );
}
