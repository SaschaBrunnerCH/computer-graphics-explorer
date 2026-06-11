import { z } from "zod";
import { termSchema, type Term, type CategoryId, type Difficulty } from "./types";
import { categories, categoryById } from "./categories";
import { renderingFundamentals } from "./terms/rendering-fundamentals";
import { geometryScene } from "./terms/geometry-scene";
import { shadingMaterials } from "./terms/shading-materials";
import { lighting } from "./terms/lighting";
import { texturesSampling } from "./terms/textures-sampling";
import { postProcessing } from "./terms/post-processing";
import { realtimeGis } from "./terms/realtime-gis";

const rawTerms: Term[] = [
  ...renderingFundamentals,
  ...geometryScene,
  ...shadingMaterials,
  ...lighting,
  ...texturesSampling,
  ...postProcessing,
  ...realtimeGis,
];

// Validate shape plus referential integrity (unique ids, resolvable related ids).
const catalogSchema = z.array(termSchema).superRefine((all, ctx) => {
  const ids = new Set<string>();
  for (const term of all) {
    if (ids.has(term.id)) {
      ctx.addIssue({ code: "custom", message: `Duplicate term id: ${term.id}` });
    }
    ids.add(term.id);
  }
  for (const term of all) {
    for (const related of term.relatedTermIds) {
      if (!ids.has(related)) {
        ctx.addIssue({
          code: "custom",
          message: `Term "${term.id}" references unknown related term "${related}"`,
        });
      }
    }
  }
});

export const terms: Term[] = catalogSchema.parse(rawTerms);

export const termById = new Map(terms.map((t) => [t.id, t]));

export const termsByCategory = new Map<CategoryId, Term[]>(
  categories.map((c) => [c.id, terms.filter((t) => t.category === c.id)]),
);

export const difficultyMeta: Record<Difficulty, { label: string; emoji: string }> = {
  basics: { label: "Basics", emoji: "🟢" },
  intermediate: { label: "Intermediate", emoji: "🟡" },
  advanced: { label: "Advanced", emoji: "🔴" },
};

export { categories, categoryById };
export type { Term, CategoryId, Difficulty };
