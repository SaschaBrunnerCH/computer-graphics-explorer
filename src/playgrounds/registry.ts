import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * Maps a term's `demo` key to its lazily loaded playground component.
 * Each playground lives in its own chunk so ArcGIS and Three.js demos
 * never load upfront (or together) unless visited.
 *
 * To add a playground: create a component under arcgis/ | r3f/ | webgl/ |
 * diagrams/, add one line here, and set `demo: "<key>"` on the term(s).
 */
export const playgrounds: Record<string, LazyExoticComponent<ComponentType>> = {
  "shading-models": lazy(() => import("./r3f/ShadingModels")),
  "depth-buffer": lazy(() => import("./webgl/DepthBuffer")),
};
