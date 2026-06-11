import { useSyncExternalStore } from "react";

const STORAGE_KEY = "cge:understood";
const listeners = new Set<() => void>();

function load(): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

let understood: ReadonlySet<string> = load();

export function toggleUnderstood(termId: string): void {
  const next = new Set(understood);
  if (next.has(termId)) {
    next.delete(termId);
  } else {
    next.add(termId);
  }
  understood = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  listeners.forEach((l) => l());
}

/** Set of term ids the visitor marked as understood (persisted in localStorage). */
export function useUnderstood(): ReadonlySet<string> {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => understood,
  );
}
