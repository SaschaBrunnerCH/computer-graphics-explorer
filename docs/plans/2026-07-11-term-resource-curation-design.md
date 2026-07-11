# Term resource curation design

## Goal

Make the further-reading section genuinely useful for each glossary term. Links must lead to the closest relevant PBRT section or Scratchapixel lesson, rather than a broad chapter, contents page, or homepage.

## Data model

Replace the fixed pair of one Scratchapixel and one PBRT entry with a read-only list of zero to four `FurtherReadingLink` entries per term. Each entry records its source, exact section or lesson title, and direct URL.

The list is intentionally hand-curated. A term receives only links that are a real conceptual match; it is valid for a term to have no links. There is no category-based fallback.

## Presentation

The existing Further reading area renders all curated links in their curated order. Repeated sources are allowed, so a term can point to multiple PBRT sections or multiple Scratchapixel lessons. The section is hidden when a term has no curated links.

## Safeguards and verification

- Catalog validation accepts zero to four entries, but rejects malformed, duplicate, homepage, and contents-page URLs.
- Each direct PBRT URL is checked against its published section path; each Scratchapixel URL is checked against the lesson it names.
- Browser tests cover no links, multiple links, and a PBRT subsection such as Path Tracing.
- Typecheck, lint, browser tests, and production build must pass.

## Scope

This changes only external further-reading curation. It does not add new glossary content, alter demos, or add links merely to satisfy coverage.
