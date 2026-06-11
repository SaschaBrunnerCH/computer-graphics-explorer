import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "cge:theme";
const listeners = new Set<() => void>();

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function storedTheme(): Theme | null {
  const value = localStorage.getItem(STORAGE_KEY);
  return value === "light" || value === "dark" ? value : null;
}

let current: Theme = storedTheme() ?? systemTheme();

function apply(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("calcite-mode-dark", theme === "dark");
  root.classList.toggle("calcite-mode-light", theme === "light");
  root.style.colorScheme = theme;
}

apply(current);

// Follow OS changes as long as the visitor hasn't chosen explicitly.
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (storedTheme() === null) {
    current = systemTheme();
    apply(current);
    listeners.forEach((l) => l());
  }
});

export function setTheme(theme: Theme): void {
  current = theme;
  localStorage.setItem(STORAGE_KEY, theme);
  apply(theme);
  listeners.forEach((l) => l());
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => current,
  );
}
