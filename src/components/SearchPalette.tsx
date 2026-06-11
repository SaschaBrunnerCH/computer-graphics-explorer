import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Fuse from "fuse.js";
import { terms, categoryById } from "../data";
import { DifficultyBadge } from "./DifficultyBadge";

import "@esri/calcite-components/components/calcite-icon";

const fuse = new Fuse(terms, {
  keys: [
    { name: "title", weight: 3 },
    { name: "synonyms", weight: 2 },
    { name: "explanation", weight: 1 },
    { name: "whyItMatters", weight: 0.5 },
  ],
  threshold: 0.35,
  ignoreLocation: true,
});

export function SearchPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.JSX.Element | null {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => {
    if (!query.trim()) return terms.slice(0, 8);
    return fuse
      .search(query)
      .slice(0, 10)
      .map((r) => r.item);
  }, [query]);

  // Reset on open and on query change via render-time state adjustment
  // (per react.dev/learn/you-might-not-need-an-effect).
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }
  const [prevQuery, setPrevQuery] = useState(query);
  if (prevQuery !== query) {
    setPrevQuery(query);
    setActiveIndex(0);
  }

  useEffect(() => {
    if (open) {
      // Wait a tick so the element exists before focusing.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  const select = (termId: string): void => {
    onClose();
    navigate(`/term/${termId}`);
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      select(results[activeIndex].id);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search terms"
        className="mx-4 w-full max-w-xl overflow-hidden rounded-xl border border-[var(--calcite-color-border-1)] bg-[var(--calcite-color-foreground-1)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-[var(--calcite-color-border-2)] px-4 py-3">
          <calcite-icon icon="search" scale="s" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search terms, synonyms, explanations…"
            aria-label="Search terms"
            className="w-full border-none bg-transparent text-base text-[var(--calcite-color-text-1)] outline-none placeholder:text-[var(--calcite-color-text-3)]"
          />
          <kbd className="rounded border border-[var(--calcite-color-border-1)] px-1.5 py-0.5 text-xs text-[var(--calcite-color-text-3)]">
            esc
          </kbd>
        </div>
        <ul ref={listRef} className="m-0 max-h-[50vh] list-none overflow-y-auto p-2" role="listbox">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-[var(--calcite-color-text-3)]">
              Nothing found — try a different spelling or browse the sidebar.
            </li>
          )}
          {results.map((term, i) => (
            <li key={term.id} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                onClick={() => select(term.id)}
                onMouseEnter={() => setActiveIndex(i)}
                className={
                  "flex w-full cursor-pointer items-center gap-3 rounded-lg border-none px-3 py-2 text-left " +
                  (i === activeIndex
                    ? "bg-[var(--calcite-color-brand)] text-white"
                    : "bg-transparent text-[var(--calcite-color-text-1)]")
                }
              >
                <DifficultyBadge difficulty={term.difficulty} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{term.title}</span>
                  <span
                    className={
                      "block truncate text-xs " +
                      (i === activeIndex ? "text-white/80" : "text-[var(--calcite-color-text-3)]")
                    }
                  >
                    {categoryById.get(term.category)?.title}
                    {term.demo ? " · interactive playground" : ""}
                  </span>
                </span>
                {term.demo && <calcite-icon icon="play" scale="s" aria-label="Has playground" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
