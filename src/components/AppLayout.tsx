import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { SearchPalette } from "./SearchPalette";
import { useTheme, setTheme } from "../state/theme";

import "@esri/calcite-components/components/calcite-shell";
import "@esri/calcite-components/components/calcite-shell-panel";
import "@esri/calcite-components/components/calcite-navigation";
import "@esri/calcite-components/components/calcite-navigation-logo";
import "@esri/calcite-components/components/calcite-action";
import "@esri/calcite-components/components/calcite-button";

export const GITHUB_URL = "https://github.com/SaschaBrunnerCH/computer-graphics-explorer";

export function AppLayout(): React.JSX.Element {
  const theme = useTheme();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 768);

  // Cmd/Ctrl+K opens the command palette from anywhere.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Collapse the sidebar after navigating on small screens
  // (state adjustment during render, per react.dev/learn/you-might-not-need-an-effect).
  const [prevPath, setPrevPath] = useState(location.pathname);
  if (prevPath !== location.pathname) {
    setPrevPath(location.pathname);
    if (window.innerWidth < 768) setSidebarCollapsed(true);
  }

  return (
    <calcite-shell>
      <calcite-navigation slot="header">
        <calcite-action
          slot="navigation-action"
          icon="hamburger"
          text="Toggle glossary"
          aria-label="Toggle glossary sidebar"
          onClick={() => setSidebarCollapsed((c) => !c)}
        />
        <Link to="/" slot="logo" className="no-underline">
          <calcite-navigation-logo
            heading="Computer Graphics Explorer"
            description="An explorable museum of 3D rendering"
            heading-level="1"
          />
        </Link>
        <div slot="content-end" className="flex items-center gap-1 pr-2">
          <calcite-button
            appearance="outline"
            kind="neutral"
            icon-start="search"
            onClick={() => setSearchOpen(true)}
          >
            Search
            <span className="ml-2 hidden text-xs opacity-60 sm:inline">Ctrl K</span>
          </calcite-button>
          <calcite-action
            icon={theme === "dark" ? "brightness" : "moon"}
            text="Toggle dark mode"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          />
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="GitHub repository">
            <calcite-action icon="code-branch" text="GitHub" />
          </a>
        </div>
      </calcite-navigation>

      <calcite-shell-panel
        slot="panel-start"
        position="start"
        width-scale="m"
        collapsed={sidebarCollapsed || undefined}
      >
        <Sidebar onNavigate={() => window.innerWidth < 768 && setSidebarCollapsed(true)} />
      </calcite-shell-panel>

      <main className="flex h-full flex-col overflow-y-auto">
        <div className="flex-1">
          <Outlet />
        </div>
        <footer className="border-t border-[var(--calcite-color-border-3)] px-6 py-4 text-center text-sm text-[var(--calcite-color-text-3)]">
          Open source under MIT ·{" "}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--calcite-color-brand)]"
          >
            Found a mistake or want to add a term? Contribute on GitHub!
          </a>
        </footer>
      </main>

      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </calcite-shell>
  );
}
