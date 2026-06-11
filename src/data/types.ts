import { z } from "zod";
import type { Icon } from "@esri/calcite-components/components/calcite-icon";

/** Calcite's strict icon-name union, derived from the component's `icon` property. */
export type IconName = NonNullable<Icon["icon"]>;

export const categoryIds = [
  "rendering-fundamentals",
  "geometry-scene",
  "shading-materials",
  "lighting",
  "textures-sampling",
  "post-processing",
  "realtime-gis",
] as const;

export type CategoryId = (typeof categoryIds)[number];

export const difficultySchema = z.enum(["basics", "intermediate", "advanced"]);
export type Difficulty = z.infer<typeof difficultySchema>;

export const termSchema = z.object({
  /** URL slug, e.g. "depth-buffer" */
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  title: z.string().min(1),
  synonyms: z.array(z.string()).default([]),
  category: z.enum(categoryIds),
  difficulty: difficultySchema,
  /** 2–4 beginner-friendly sentences, no unexplained jargon */
  explanation: z.string().min(40),
  /** One line connecting the concept to real applications */
  whyItMatters: z.string().min(20),
  /** Optional everyday analogy */
  analogy: z.string().optional(),
  /** Where to spot the concept in games / maps / movies (short bullets) */
  spotItInTheWild: z.array(z.string()).default([]),
  /** Optional "go deeper" technical version (plain text, may contain `code` backticks) */
  deeperDive: z.string().optional(),
  relatedTermIds: z.array(z.string()).default([]),
  /** Key into the playground registry; terms without one show a friendly coming-soon state */
  demo: z.string().optional(),
});

export type Term = z.infer<typeof termSchema>;

export interface Category {
  id: CategoryId;
  title: string;
  icon: IconName;
  tagline: string;
}
