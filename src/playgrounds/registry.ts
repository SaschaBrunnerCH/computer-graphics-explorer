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
  shadows: lazy(() => import("./arcgis/Shadows")),
  "global-illumination": lazy(() => import("./r3f/GlobalIllumination")),
  "pbr-materials": lazy(() => import("./r3f/PbrMaterials")),
  "frustum-culling": lazy(() => import("./r3f/FrustumCulling")),
  "texture-filtering": lazy(() => import("./r3f/TextureFiltering")),
  "anti-aliasing": lazy(() => import("./r3f/AntiAliasing")),
  rasterization: lazy(() => import("./diagrams/Rasterization")),
  "atmosphere-fog": lazy(() => import("./arcgis/AtmosphereFog")),
  lod: lazy(() => import("./arcgis/Lod")),
  ssao: lazy(() => import("./arcgis/Ssao")),
};

/** Demo keys rendered with the ArcGIS Maps SDK (marked with the SDK logo in the TOC). */
export const arcgisPlaygrounds: ReadonlySet<string> = new Set([
  "shadows",
  "atmosphere-fog",
  "lod",
  "ssao",
]);
