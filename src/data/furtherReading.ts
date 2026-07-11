import type { Term } from "./types";

type ReadingSource = "Scratchapixel" | "PBRT";

export interface FurtherReadingLink {
  readonly source: ReadingSource;
  readonly title: string;
  readonly url: string;
}

type TermReading = readonly FurtherReadingLink[];

const scratchapixel = (title: string, path: string): FurtherReadingLink => ({
  source: "Scratchapixel",
  title,
  url: `https://www.scratchapixel.com${path}`,
});

const pbrt = (title: string, path: string): FurtherReadingLink => ({
  source: "PBRT",
  title,
  url: `https://www.pbr-book.org${path}`,
});

const links = (...resources: FurtherReadingLink[]): TermReading => resources;

/**
 * Hand-curated, direct lessons and PBRT subsections. Absence is intentional: a
 * term without an entry has no close enough match in these two resources.
 */
const furtherReadingByTerm: Readonly<Record<string, TermReading>> = {
  rendering: links(
    scratchapixel(
      "Rendering an Image of a 3D Scene",
      "/lessons/3d-basic-rendering/rendering-3d-scene-overview/computer-discrete-raster.html",
    ),
    pbrt(
      "§1.2 Photorealistic Rendering and the Ray-Tracing Algorithm",
      "/4ed/Introduction/Photorealistic_Rendering_and_the_Ray-Tracing_Algorithm",
    ),
  ),
  rasterization: links(
    scratchapixel(
      "An Overview of the Rasterization Algorithm",
      "/lessons/3d-basic-rendering/rasterization-practical-implementation/overview-rasterization-algorithm.html",
    ),
    scratchapixel(
      "The Rasterization Stage",
      "/lessons/3d-basic-rendering/rasterization-practical-implementation/rasterization-stage.html",
    ),
  ),
  "ray-tracing": links(
    scratchapixel(
      "Overview of the Ray-Tracing Rendering Technique",
      "/lessons/3d-basic-rendering/ray-tracing-overview/ray-tracing-rendering-technique-overview.html",
    ),
    scratchapixel(
      "Light Transport Algorithms and Ray-Tracing: Whitted Ray-Tracing",
      "/lessons/3d-basic-rendering/ray-tracing-overview/light-transport-ray-tracing-whitted.html",
    ),
    pbrt(
      "§1.2 Photorealistic Rendering and the Ray-Tracing Algorithm",
      "/4ed/Introduction/Photorealistic_Rendering_and_the_Ray-Tracing_Algorithm",
    ),
  ),
  "ray-casting": links(
    scratchapixel(
      "Definition of a Ray",
      "/lessons/3d-basic-rendering/ray-tracing-generating-camera-rays/definition-ray.html",
    ),
    scratchapixel(
      "Ray-Triangle Intersection: Geometric Solution",
      "/lessons/3d-basic-rendering/ray-tracing-rendering-a-triangle/ray-triangle-intersection-geometric-solution.html",
    ),
    pbrt("§3.6 Rays", "/4ed/Geometry_and_Transformations/Rays"),
  ),
  "render-pipeline": links(
    scratchapixel(
      "About the Projection Matrix, the GPU Rendering Pipeline and Clipping",
      "/lessons/3d-basic-rendering/perspective-and-orthographic-projection-matrix/projection-matrix-GPU-rendering-pipeline-clipping.html",
    ),
  ),
  "frame-buffer": links(
    scratchapixel(
      "The Visibility Problem, the Depth Buffer Algorithm and Depth Interpolation",
      "/lessons/3d-basic-rendering/rasterization-practical-implementation/visibility-problem-depth-buffer-depth-interpolation.html",
    ),
  ),
  "depth-buffer": links(
    scratchapixel(
      "The Visibility Problem, the Depth Buffer Algorithm and Depth Interpolation",
      "/lessons/3d-basic-rendering/rasterization-practical-implementation/visibility-problem-depth-buffer-depth-interpolation.html",
    ),
    scratchapixel(
      "A Virtual Pinhole Camera Model",
      "/lessons/3d-basic-rendering/3d-viewing-pinhole-camera/virtual-pinhole-camera-model.html",
    ),
    pbrt("§5.2 Projective Camera Models", "/4ed/Cameras_and_Film/Projective_Camera_Models"),
  ),
  "gpu-vs-cpu-rendering": links(
    pbrt(
      "§15.1 Mapping Path Tracing to the GPU",
      "/4ed/Wavefront_Rendering_on_GPUs/Mapping_Path_Tracing_to_the_GPU",
    ),
    pbrt(
      "§15.2 Implementation Foundations",
      "/4ed/Wavefront_Rendering_on_GPUs/Implementation_Foundations",
    ),
  ),

  vertex: links(
    scratchapixel(
      "Perspective Correct Interpolation and Vertex Attributes",
      "/lessons/3d-basic-rendering/rasterization-practical-implementation/perspective-correct-interpolation-vertex-attributes.html",
    ),
    pbrt("§6.5 Triangle Meshes", "/4ed/Shapes/Triangle_Meshes"),
  ),
  "triangle-mesh": links(
    scratchapixel(
      "Introduction to Polygon Meshes",
      "/lessons/3d-basic-rendering/introduction-polygon-mesh/introduction.html",
    ),
    pbrt("§6.5 Triangle Meshes", "/4ed/Shapes/Triangle_Meshes"),
  ),
  "normal-vectors": links(
    scratchapixel(
      "Points, Vectors and Normals",
      "/lessons/mathematics-physics-for-computer-graphics/geometry/points-vectors-and-normals.html",
    ),
    scratchapixel(
      "Transforming Normals",
      "/lessons/mathematics-physics-for-computer-graphics/geometry/transforming-normals.html",
    ),
    pbrt("§3.5 Normals", "/4ed/Geometry_and_Transformations/Normals"),
    pbrt("§6.5 Triangle Meshes", "/4ed/Shapes/Triangle_Meshes"),
  ),
  "transformation-matrices": links(
    scratchapixel(
      "Using 4×4 Matrices to Transform Objects in 3D",
      "/lessons/3d-basic-rendering/transforming-objects-using-matrices/using-4x4-matrices-transform-objects-3D.html",
    ),
    scratchapixel(
      "Framing: The LookAt Function",
      "/lessons/mathematics-physics-for-computer-graphics/lookat-function/framing-lookat-function.html",
    ),
    scratchapixel(
      "What Are Projection Matrices and Where/Why Are They Used?",
      "/lessons/3d-basic-rendering/perspective-and-orthographic-projection-matrix/projection-matrix-introduction.html",
    ),
    pbrt(
      "§3.10 Applying Transformations",
      "/4ed/Geometry_and_Transformations/Applying_Transformations",
    ),
  ),
  "camera-frustum": links(
    scratchapixel(
      "A Virtual Pinhole Camera Model",
      "/lessons/3d-basic-rendering/3d-viewing-pinhole-camera/virtual-pinhole-camera-model.html",
    ),
    scratchapixel(
      "About the Projection Matrix, the GPU Rendering Pipeline and Clipping",
      "/lessons/3d-basic-rendering/perspective-and-orthographic-projection-matrix/projection-matrix-GPU-rendering-pipeline-clipping.html",
    ),
    pbrt("§5.2 Projective Camera Models", "/4ed/Cameras_and_Film/Projective_Camera_Models"),
  ),
  "frustum-culling": links(
    scratchapixel(
      "About the Projection Matrix, the GPU Rendering Pipeline and Clipping",
      "/lessons/3d-basic-rendering/perspective-and-orthographic-projection-matrix/projection-matrix-GPU-rendering-pipeline-clipping.html",
    ),
    pbrt("§5.2 Projective Camera Models", "/4ed/Cameras_and_Film/Projective_Camera_Models"),
  ),
  "backface-culling": links(
    scratchapixel(
      "Single vs Double Sided Triangle and Backface Culling",
      "/lessons/3d-basic-rendering/ray-tracing-rendering-a-triangle/single-vs-double-sided-triangle-backface-culling.html",
    ),
    scratchapixel(
      "Introduction to Polygon Meshes",
      "/lessons/3d-basic-rendering/introduction-polygon-mesh/introduction.html",
    ),
  ),
  instancing: links(
    pbrt(
      "§7.1 Primitive Interface and Geometric Primitives",
      "/4ed/Primitives_and_Intersection_Acceleration/Primitive_Interface_and_Geometric_Primitives",
    ),
    pbrt("§6.5 Triangle Meshes", "/4ed/Shapes/Triangle_Meshes"),
  ),

  "shading-models": links(
    scratchapixel(
      "Normals, Vertex Normals and Facing Ratio",
      "/lessons/3d-basic-rendering/introduction-to-shading/shading-normals.html",
    ),
    scratchapixel(
      "The Phong Model and the Concepts of Illumination Models and BRDF",
      "/lessons/3d-basic-rendering/phong-shader-BRDF/phong-illumination-models-brdf.html",
    ),
  ),
  shader: links(
    scratchapixel(
      "The Phong Model and the Concepts of Illumination Models and BRDF",
      "/lessons/3d-basic-rendering/phong-shader-BRDF/phong-illumination-models-brdf.html",
    ),
  ),
  brdf: links(
    scratchapixel(
      "A Creative Dive into BRDF, Linearity, and Exposure",
      "/lessons/3d-basic-rendering/brdf-linear-exposure/intro-brdf.html",
    ),
    pbrt("§9.1 BSDF Representation", "/4ed/Reflection_Models/BSDF_Representation"),
    pbrt(
      "§9.6 Roughness Using Microfacet Theory",
      "/4ed/Reflection_Models/Roughness_Using_Microfacet_Theory",
    ),
  ),
  pbr: links(
    pbrt("§9.1 BSDF Representation", "/4ed/Reflection_Models/BSDF_Representation"),
    pbrt(
      "§9.6 Roughness Using Microfacet Theory",
      "/4ed/Reflection_Models/Roughness_Using_Microfacet_Theory",
    ),
    pbrt("§9.4 Conductor BRDF", "/4ed/Reflection_Models/Conductor_BRDF"),
    pbrt("§9.5 Dielectric BSDF", "/4ed/Reflection_Models/Dielectric_BSDF"),
  ),
  "metalness-roughness": links(
    pbrt("§9.4 Conductor BRDF", "/4ed/Reflection_Models/Conductor_BRDF"),
    pbrt("§9.5 Dielectric BSDF", "/4ed/Reflection_Models/Dielectric_BSDF"),
    pbrt(
      "§9.6 Roughness Using Microfacet Theory",
      "/4ed/Reflection_Models/Roughness_Using_Microfacet_Theory",
    ),
  ),
  albedo: links(
    scratchapixel(
      "What is Shading: Light-Matter Interaction",
      "/lessons/3d-basic-rendering/introduction-to-shading/what-is-shading-light-matter-interaction.html",
    ),
    pbrt("§9.2 Diffuse Reflection", "/4ed/Reflection_Models/Diffuse_Reflection"),
  ),
  "specular-vs-diffuse": links(
    scratchapixel(
      "The Phong Model and the Concepts of Illumination Models and BRDF",
      "/lessons/3d-basic-rendering/phong-shader-BRDF/phong-illumination-models-brdf.html",
    ),
    pbrt("§9.2 Diffuse Reflection", "/4ed/Reflection_Models/Diffuse_Reflection"),
    pbrt(
      "§9.3 Specular Reflection and Transmission",
      "/4ed/Reflection_Models/Specular_Reflection_and_Transmission",
    ),
  ),
  "fresnel-effect": links(
    scratchapixel(
      "Reflection, Refraction and Fresnel",
      "/lessons/3d-basic-rendering/introduction-to-shading/reflection-refraction-fresnel.html",
    ),
    pbrt(
      "§9.3 Specular Reflection and Transmission",
      "/4ed/Reflection_Models/Specular_Reflection_and_Transmission",
    ),
  ),
  "normal-mapping": links(
    pbrt(
      "§10.5.3 Normal Mapping",
      "/4ed/Textures_and_Materials/Material_Interface_and_Implementations#NormalMapping",
    ),
  ),
  "bump-mapping": links(
    pbrt(
      "§10.5.4 Bump Mapping",
      "/4ed/Textures_and_Materials/Material_Interface_and_Implementations#BumpMapping",
    ),
  ),

  "direct-vs-indirect-lighting": links(
    scratchapixel(
      "An Intuitive Introduction to Global Illumination and Path Tracing",
      "/lessons/3d-basic-rendering/global-illumination-path-tracing/introduction-global-illumination-path-tracing.html",
    ),
    pbrt(
      "§13.1 The Light Transport Equation",
      "/4ed/Light_Transport_I_Surface_Reflection/The_Light_Transport_Equation",
    ),
  ),
  "global-illumination": links(
    scratchapixel(
      "An Intuitive Introduction to Global Illumination and Path Tracing",
      "/lessons/3d-basic-rendering/global-illumination-path-tracing/introduction-global-illumination-path-tracing.html",
    ),
    pbrt(
      "§13.1 The Light Transport Equation",
      "/4ed/Light_Transport_I_Surface_Reflection/The_Light_Transport_Equation",
    ),
    pbrt("§13.2 Path Tracing", "/4ed/Light_Transport_I_Surface_Reflection/Path_Tracing"),
  ),
  radiosity: links(
    scratchapixel(
      "An Intuitive Introduction to Global Illumination and Path Tracing",
      "/lessons/3d-basic-rendering/global-illumination-path-tracing/introduction-global-illumination-path-tracing.html",
    ),
  ),
  "path-tracing": links(
    scratchapixel(
      "An Intuitive Introduction to Global Illumination and Path Tracing",
      "/lessons/3d-basic-rendering/global-illumination-path-tracing/introduction-global-illumination-path-tracing.html",
    ),
    pbrt("§13.2 Path Tracing", "/4ed/Light_Transport_I_Surface_Reflection/Path_Tracing"),
    pbrt(
      "§13.4 A Better Path Tracer",
      "/4ed/Light_Transport_I_Surface_Reflection/A_Better_Path_Tracer",
    ),
    pbrt(
      "§15.1 Mapping Path Tracing to the GPU",
      "/4ed/Wavefront_Rendering_on_GPUs/Mapping_Path_Tracing_to_the_GPU",
    ),
  ),
  "light-types": links(
    scratchapixel(
      "Point and Spot Lights",
      "/lessons/3d-basic-rendering/introduction-to-lighting/introduction-to-lighting-punctual-lights.html",
    ),
    scratchapixel(
      "Distant Lights",
      "/lessons/3d-basic-rendering/introduction-to-lighting/introduction-to-lighting-distant-lights.html",
    ),
    scratchapixel(
      "Area Lights: Mathematical Foundations",
      "/lessons/3d-basic-rendering/introduction-to-lighting/introduction-to-lighting-area-lights-theory.html",
    ),
    pbrt("§12.1 Light Interface", "/4ed/Light_Sources/Light_Interface"),
  ),
  "image-based-lighting": links(
    pbrt("§12.5 Infinite Area Lights", "/4ed/Light_Sources/Infinite_Area_Lights"),
  ),
  "shadow-mapping": links(
    scratchapixel(
      "Light and Shadows",
      "/lessons/3d-basic-rendering/introduction-to-shading/ligth-and-shadows.html",
    ),
    scratchapixel(
      "The Visibility Problem, the Depth Buffer Algorithm and Depth Interpolation",
      "/lessons/3d-basic-rendering/rasterization-practical-implementation/visibility-problem-depth-buffer-depth-interpolation.html",
    ),
  ),
  "soft-vs-hard-shadows": links(
    scratchapixel(
      "Area Lights: Mathematical Foundations",
      "/lessons/3d-basic-rendering/introduction-to-lighting/introduction-to-lighting-area-lights-theory.html",
    ),
    scratchapixel(
      "Spherical Area Light: Using Cone Sampling",
      "/lessons/3d-basic-rendering/introduction-to-lighting/introduction-to-lighting-spherical-light-cone-sampling.html",
    ),
    pbrt("§12.2 Point Lights", "/4ed/Light_Sources/Point_Lights"),
    pbrt("§12.4 Area Lights", "/4ed/Light_Sources/Area_Lights"),
  ),

  "texture-mapping": links(
    scratchapixel(
      "Basic Implementation",
      "/lessons/3d-basic-rendering/introduction-to-texturing/introduction-to-texturing-basic-implementation.html",
    ),
    pbrt(
      "§10.2 Texture Coordinate Generation",
      "/4ed/Textures_and_Materials/Texture_Coordinate_Generation",
    ),
  ),
  "uv-coordinates": links(
    scratchapixel(
      "Basic Implementation",
      "/lessons/3d-basic-rendering/introduction-to-texturing/introduction-to-texturing-basic-implementation.html",
    ),
    pbrt(
      "§10.2 Texture Coordinate Generation",
      "/4ed/Textures_and_Materials/Texture_Coordinate_Generation",
    ),
  ),
  mipmapping: links(pbrt("§10.4 Image Texture", "/4ed/Textures_and_Materials/Image_Texture")),
  "texture-filtering": links(
    pbrt("§10.4 Image Texture", "/4ed/Textures_and_Materials/Image_Texture"),
  ),
  "anti-aliasing": links(
    scratchapixel(
      "Rasterization: a Practical Implementation",
      "/lessons/3d-basic-rendering/rasterization-practical-implementation/rasterization-practical-implementation.html",
    ),
    pbrt("§8.1 Sampling Theory", "/4ed/Sampling_and_Reconstruction/Sampling_Theory"),
    pbrt("§8.8 Image Reconstruction", "/4ed/Sampling_and_Reconstruction/Image_Reconstruction"),
  ),
  "moire-patterns": links(
    scratchapixel(
      "Procedural Texturing",
      "/lessons/3d-basic-rendering/introduction-to-shading/procedural-texturing.html",
    ),
    pbrt("§8.1 Sampling Theory", "/4ed/Sampling_and_Reconstruction/Sampling_Theory"),
  ),

  "depth-of-field": links(
    scratchapixel(
      "Example 1: Simulating the Bokeh Effect in 2D",
      "/lessons/digital-imaging/simple-image-manipulations/bookeh-effect.html",
    ),
    pbrt("§5.2 Projective Camera Models", "/4ed/Cameras_and_Film/Projective_Camera_Models"),
  ),
  "motion-blur": links(pbrt("§5.1 Camera Interface", "/4ed/Cameras_and_Film/Camera_Interface")),
  "gamma-correction": links(
    scratchapixel(
      "Displaying Images to the Screen",
      "/lessons/digital-imaging/digital-images/display-image-to-screen.html",
    ),
  ),
  "color-spaces": links(
    scratchapixel(
      "Introduction to Light, Color and Color Space",
      "/lessons/digital-imaging/colors/introduction.html",
    ),
    scratchapixel(
      "Displaying Images to the Screen",
      "/lessons/digital-imaging/digital-images/display-image-to-screen.html",
    ),
    pbrt("§4.6 Color", "/4ed/Radiometry,_Spectra,_and_Color/Color"),
  ),

  "webgl-vs-webgpu": links(
    pbrt(
      "§15.1.1 Basic GPU Architecture",
      "/4ed/Wavefront_Rendering_on_GPUs/Mapping_Path_Tracing_to_the_GPU#BasicGPUArchitecture",
    ),
  ),
  "occlusion-culling": links(
    scratchapixel(
      "Rendering an Image of a 3D Scene",
      "/lessons/3d-basic-rendering/rendering-3d-scene-overview/3d-rendering-overview.html",
    ),
    scratchapixel(
      "The Visibility Problem, the Depth Buffer Algorithm and Depth Interpolation",
      "/lessons/3d-basic-rendering/rasterization-practical-implementation/visibility-problem-depth-buffer-depth-interpolation.html",
    ),
  ),
  "terrain-rendering": links(
    scratchapixel(
      "Using Perlin Noise to Create a Terrain Mesh",
      "/lessons/procedural-generation-virtual-worlds/perlin-noise-part-2/perlin-noise-terrain-mesh.html",
    ),
    pbrt("§6.5 Triangle Meshes", "/4ed/Shapes/Triangle_Meshes"),
  ),
  "elevation-exaggeration": links(
    scratchapixel(
      "Using 4×4 Matrices to Transform Objects in 3D",
      "/lessons/3d-basic-rendering/transforming-objects-using-matrices/using-4x4-matrices-transform-objects-3D.html",
    ),
    pbrt("§3.9.5 Scaling", "/4ed/Geometry_and_Transformations/Transformations#Scaling"),
  ),
  "atmosphere-rendering": links(
    scratchapixel(
      "Simulating the Colors of the Sky",
      "/lessons/procedural-generation-virtual-worlds/simulating-sky/simulating-colors-of-the-sky.html",
    ),
    pbrt(
      "§11.1.3 Out Scattering and Attenuation",
      "/4ed/Volume_Scattering/Volume_Scattering_Processes#OutScatteringandAttenuation",
    ),
    pbrt(
      "§11.1.4 In Scattering",
      "/4ed/Volume_Scattering/Volume_Scattering_Processes#InScattering",
    ),
    pbrt("§11.3 Phase Functions", "/4ed/Volume_Scattering/Phase_Functions"),
  ),
};

const emptyReading: TermReading = [];

export const getFurtherReading = (term: Pick<Term, "id">): TermReading =>
  furtherReadingByTerm[term.id] ?? emptyReading;

/** Fail early if a curation entry is malformed, generic, duplicated, or overfull. */
export function validateFurtherReading(terms: readonly Pick<Term, "id">[]): void {
  const knownTermIds = new Set(terms.map((term) => term.id));

  for (const [termId, resources] of Object.entries(furtherReadingByTerm)) {
    if (!knownTermIds.has(termId)) {
      throw new Error(`Further-reading links configured for unknown term "${termId}".`);
    }
    if (resources.length > 4) {
      throw new Error(`Term "${termId}" has more than four further-reading links.`);
    }

    const urls = new Set<string>();
    for (const resource of resources) {
      if (urls.has(resource.url)) {
        throw new Error(`Term "${termId}" has a duplicate further-reading URL.`);
      }
      urls.add(resource.url);

      let url: URL;
      try {
        url = new URL(resource.url);
      } catch {
        throw new Error(`Term "${termId}" has an invalid further-reading URL.`);
      }

      if (url.protocol !== "https:") {
        throw new Error(`Term "${termId}" must use an HTTPS further-reading URL.`);
      }
      if (resource.source === "Scratchapixel") {
        if (
          url.hostname !== "www.scratchapixel.com" ||
          !url.pathname.startsWith("/lessons/") ||
          !url.pathname.endsWith(".html")
        ) {
          throw new Error(`Scratchapixel link for "${termId}" must target a direct lesson.`);
        }
      } else if (
        url.hostname !== "www.pbr-book.org" ||
        !url.pathname.startsWith("/4ed/") ||
        url.pathname.split("/").filter(Boolean).length < 3
      ) {
        throw new Error(`PBRT link for "${termId}" must target a direct subsection.`);
      }
    }
  }
}
