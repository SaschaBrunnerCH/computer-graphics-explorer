import { useEffect } from "react";

const SITE_NAME = "Computer Graphics Explorer";

/** Per-page document title + description + OG tags, so shared deep links unfurl nicely. */
export function usePageMeta(title: string | undefined, description?: string): void {
  useEffect(() => {
    const fullTitle = title ? `${title} — ${SITE_NAME}` : SITE_NAME;
    document.title = fullTitle;
    setMeta("name", "description", description);
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", window.location.href);
  }, [title, description]);
}

function setMeta(attr: "name" | "property", key: string, content: string | undefined): void {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!content) return;
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.content = content;
}
