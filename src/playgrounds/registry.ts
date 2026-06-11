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
  // Phase 2 — Shading & Light (docs/plans/phase-2-shading-and-light.md)
  "normal-mapping": lazy(() => import("./r3f/NormalMapping")),
  displacement: lazy(() => import("./r3f/Displacement")),
  fresnel: lazy(() => import("./r3f/Fresnel")),
  albedo: lazy(() => import("./r3f/Albedo")),
  ibl: lazy(() => import("./r3f/Ibl")),
  "light-types": lazy(() => import("./r3f/LightTypes")),
  "light-baking": lazy(() => import("./r3f/LightBaking")),
  "shader-lab": lazy(() => import("./webgl/ShaderLab")),
  "brdf-explorer": lazy(() => import("./diagrams/BrdfExplorer")),
  "uv-unwrap": lazy(() => import("./diagrams/UvUnwrap")),
  "water-fresnel": lazy(() => import("./arcgis/WaterFresnel")),
};

/** Demo keys rendered with the ArcGIS Maps SDK (marked with the SDK logo in the TOC). */
export const arcgisPlaygrounds: ReadonlySet<string> = new Set([
  "shadows",
  "atmosphere-fog",
  "lod",
  "ssao",
  "water-fresnel",
]);
