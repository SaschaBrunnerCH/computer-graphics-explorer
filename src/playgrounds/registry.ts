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
  // Phase 3 — Rays & Post-Processing (docs/plans/phase-3-rays-and-post-processing.md)
  "ray-lab": lazy(() => import("./diagrams/RayLab")),
  "path-tracer": lazy(() => import("./diagrams/PathTracer")),
  radiosity: lazy(() => import("./diagrams/Radiosity")),
  "motion-blur": lazy(() => import("./diagrams/MotionBlur")),
  gamma: lazy(() => import("./diagrams/Gamma")),
  "frame-time": lazy(() => import("./diagrams/FrameTime")),
  "tone-mapping": lazy(() => import("./r3f/ToneMapping")),
  bloom: lazy(() => import("./r3f/Bloom")),
  "depth-of-field": lazy(() => import("./r3f/DepthOfField")),
  ssr: lazy(() => import("./r3f/Ssr")),
  "scene-picking": lazy(() => import("./arcgis/ScenePicking")),
  // Phase 4 — Geometry, Pipeline & GIS (docs/plans/phase-4-geometry-pipeline-gis.md)
  "mesh-inspector": lazy(() => import("./r3f/MeshInspector")),
  "scene-graph": lazy(() => import("./r3f/SceneGraph")),
  "backface-culling": lazy(() => import("./r3f/BackfaceCulling")),
  instancing: lazy(() => import("./r3f/Instancing")),
  "mvp-matrices": lazy(() => import("./r3f/MvpMatrices")),
  "pipeline-diagram": lazy(() => import("./diagrams/PipelineDiagram")),
  "gpu-race": lazy(() => import("./diagrams/GpuRace")),
  "terrain-exaggeration": lazy(() => import("./arcgis/TerrainExaggeration")),
  "scene-streaming": lazy(() => import("./arcgis/SceneStreaming")),
  "edge-rendering": lazy(() => import("./arcgis/EdgeRendering")),
  "basemap-mips": lazy(() => import("./arcgis/BasemapMips")),
  "gltf-pbr": lazy(() => import("./arcgis/GltfPbr")),
  "scene-frustum": lazy(() => import("./arcgis/SceneFrustum")),
  // Phase 5 — <arcgis-map> companions (docs/plans/phase-5-arcgis-map.md)
  "vector-raster": lazy(() => import("./arcgis-map/VectorRaster")),
  "map-bloom": lazy(() => import("./arcgis-map/MapBloom")),
  "imagery-filtering": lazy(() => import("./arcgis-map/ImageryFiltering")),
  "imagery-tone": lazy(() => import("./arcgis-map/ImageryTone")),
  "map-moire": lazy(() => import("./arcgis-map/MapMoire")),
  "tile-generalization": lazy(() => import("./arcgis-map/TileGeneralization")),
  "map-frame-budget": lazy(() => import("./arcgis-map/MapFrameBudget")),
  // Phase 6 — Mesh & Material Lab (docs/plans/phase-6-mesh-material-lab.md)
  "scene-mesh": lazy(() => import("./arcgis/SceneMesh")),
  "mesh-transform": lazy(() => import("./arcgis/MeshTransform")),
  "scene-uv": lazy(() => import("./arcgis/SceneUv")),
  "scene-normal-map": lazy(() => import("./arcgis/SceneNormalMap")),
  "scene-albedo": lazy(() => import("./arcgis/SceneAlbedo")),
  "tree-instancing": lazy(() => import("./arcgis/TreeInstancing")),
};

/** Demo keys rendered with the ArcGIS Maps SDK (marked with the SDK logo in the TOC). */
export const arcgisPlaygrounds: ReadonlySet<string> = new Set([
  "shadows",
  "atmosphere-fog",
  "lod",
  "ssao",
  "water-fresnel",
  "scene-picking",
  "terrain-exaggeration",
  "scene-streaming",
  "edge-rendering",
  "basemap-mips",
  "gltf-pbr",
  "scene-frustum",
  "vector-raster",
  "map-bloom",
  "imagery-filtering",
  "imagery-tone",
  "map-moire",
  "tile-generalization",
  "map-frame-budget",
  "scene-mesh",
  "mesh-transform",
  "scene-uv",
  "scene-normal-map",
  "scene-albedo",
  "tree-instancing",
]);
