import type { TermInput } from "../types";

export const shadingMaterials: TermInput[] = [
  {
    id: "shading-models",
    title: "Shading (Flat / Gouraud / Phong)",
    synonyms: ["shading models", "flat shading", "gouraud shading", "phong shading"],
    category: "shading-materials",
    difficulty: "intermediate",
    explanation:
      "Shading decides what color each piece of a surface gets once you know where the lights are. The three classic models differ in where they do the math: flat shading computes one color per triangle (faceted look), Gouraud computes colors at the corners and blends across the triangle, and Phong blends the surface direction itself and computes lighting per pixel — the smoothest and most accurate of the three.",
    whyItMatters:
      "It's the difference between a model that looks like cut paper and one that looks like polished metal — and it set the per-vertex vs per-pixel pattern all modern shading follows.",
    analogy:
      "Painting a sphere made of flat tiles: flat shading gives each tile one solid color, Gouraud paints the corners and smears the paint across each tile, and Phong repaints every single spot of the tile based on exactly which way it faces.",
    spotItInTheWild: [
      "Early-90s games and 'low poly' art styles, which embrace the faceted flat-shaded look",
      "Smooth highlights gliding across a car model in any modern engine",
      "Per-vertex vs per-pixel lighting quality settings in older games",
    ],
    deeperDive:
      "Technically the trio differs in interpolation. Flat: one normal per face, lighting evaluated once. Gouraud: lighting evaluated at each vertex, resulting colors interpolated across the triangle — cheap, but specular highlights smaller than a triangle get smeared or vanish. Phong shading: the normal vector is interpolated across the triangle and lighting is evaluated per fragment, capturing tight highlights correctly. (Don't confuse Phong shading with the Phong reflection model — the ambient/diffuse/specular lighting formula — though both are named after Bui Tuong Phong.) Modern fragment shaders make per-pixel shading the default; try toggling all three in the playground.",
    relatedTermIds: ["shader", "normal-vectors", "specular-vs-diffuse", "rasterization"],
    demos: ["shading-models"],
  },
  {
    id: "shader",
    title: "Shader (Vertex / Fragment / Compute)",
    synonyms: ["vertex shader", "fragment shader", "pixel shader", "compute shader"],
    category: "shading-materials",
    difficulty: "intermediate",
    explanation:
      "A shader is a small program you write that runs on the GPU, executed in parallel across huge amounts of data. Vertex shaders run once per vertex and decide where points end up on screen; fragment shaders run once per covered pixel and decide its color; compute shaders skip the drawing pipeline entirely and do general number-crunching like particles or physics.",
    whyItMatters:
      "Shaders are the programmable heart of modern graphics — every material, lighting effect, and visual style you see is shader code somebody wrote.",
    analogy:
      "A factory where every worker on the line has the same instruction card. You don't direct workers individually — you write one card (the shader), and thousands of workers apply it to whatever item lands in front of them.",
    spotItInTheWild: [
      "'Compiling shaders…' loading screens and mid-game stutter",
      "Shadertoy.com, where entire scenes are built from a single fragment shader",
      "Custom visualization effects in 3D web maps, written in GLSL or WGSL",
    ],
    deeperDive:
      "Shaders are written in GLSL (OpenGL/WebGL), HLSL (DirectX), or WGSL (WebGPU) and compiled by the driver to GPU machine code. The vertex shader's job is the model→world→view→clip transform plus passing attributes downstream; the rasterizer interpolates those attributes; the fragment shader consumes them to evaluate lighting, sample textures, and output color. The execution model is SIMD-like: threads run in lockstep groups (warps/wavefronts), which is why divergent branching is expensive. Compute shaders expose the same hardware for arbitrary work — culling, skinning, particle simulation — with explicit control over thread groups and shared memory.",
    demos: ["shader-lab"],
    relatedTermIds: [
      "render-pipeline",
      "shading-models",
      "gpu-vs-cpu-rendering",
      "webgl-vs-webgpu",
    ],
  },
  {
    id: "brdf",
    title: "BRDF",
    synonyms: ["bidirectional reflectance distribution function"],
    category: "shading-materials",
    difficulty: "advanced",
    explanation:
      "A BRDF is the mathematical answer to a simple question: if light arrives at a surface from one direction, how much of it bounces off toward another direction? Every material — chalk, brushed steel, car paint — has its own characteristic answer, and that function is what makes it look like what it is. Shading a pixel ultimately means evaluating a BRDF for each light.",
    whyItMatters:
      "The BRDF is the formal core of every material system — PBR is essentially the discipline of using physically plausible BRDFs.",
    analogy:
      "Throwing a ball at different walls: a foam wall absorbs and dribbles it out in all directions (matte), a trampoline fires it back along one predictable path (mirror), and most walls are somewhere in between. The BRDF is the rulebook for how each wall returns the ball.",
    spotItInTheWild: [
      "Material 'response' differences: the same light making chalk glow softly and chrome flash sharply",
      "Measured-material libraries (MERL, Disney BRDF) used in film production",
      "The shiny lobe stretching on wet roads in racing games",
    ],
    deeperDive:
      "Formally, the BRDF f(l, v) gives the ratio of reflected radiance toward view direction v to incoming irradiance from light direction l, in units of 1/steradian. Physically plausible BRDFs obey energy conservation (never reflect more than arrives) and Helmholtz reciprocity (swapping l and v gives the same value). A perfectly diffuse (Lambertian) surface has a constant BRDF; real-time engines typically pair that with a microfacet specular term like Cook-Torrance, where a statistical distribution of tiny mirror facets (GGX is the modern standard) produces roughness-controlled highlights. The rendering equation integrates the BRDF against incoming light over the whole hemisphere — which is exactly what path tracers sample.",
    demos: ["brdf-explorer"],
    relatedTermIds: ["pbr", "specular-vs-diffuse", "metalness-roughness", "path-tracing"],
  },
  {
    id: "pbr",
    title: "Physically Based Rendering (PBR)",
    synonyms: ["physically based shading", "physically based materials"],
    category: "shading-materials",
    difficulty: "intermediate",
    explanation:
      "PBR is an approach to materials and lighting that follows the actual physics of light instead of artistic hacks: energy is conserved, metals and non-metals behave differently, and surfaces respond consistently no matter how you light them. Artists describe materials with intuitive physical properties — base color, how metallic, how rough — and the renderer takes care of the rest.",
    whyItMatters:
      "PBR is why a 3D asset looks correct in any scene and any lighting — it made materials portable across tools, engines, and time of day.",
    analogy:
      "Mixing paint by recipe instead of by eye: instead of tweaking a color until it looks right under your studio lamp (and wrong everywhere else), you write down the pigment's real properties, and it looks right under any lamp.",
    spotItInTheWild: [
      "glTF models with metallic-roughness materials — the standard format 3D web maps and the ArcGIS SDK consume",
      "Every major engine since roughly 2014: Unreal, Unity, Frostbite, three.js",
      "Product configurators where the same leather looks right in daylight and showroom lighting",
    ],
    deeperDive:
      "The pillars: energy conservation (diffuse + specular never exceed incoming light), a microfacet specular BRDF (usually Cook-Torrance with GGX distribution), Fresnel-correct reflectance (everything becomes mirror-like at grazing angles), and a clean metal/dielectric split — metals have no diffuse component and tint their reflections, dielectrics reflect ~4% white at normal incidence. Inputs are calibrated, linear-space values rather than eyeballed numbers. PBR also implies physically meaningful lights (lumens, color temperature) and image-based lighting for environment reflections. Disney's 2012 'principled' BRDF popularized the artist-friendly parameterization most engines now share.",
    relatedTermIds: [
      "brdf",
      "metalness-roughness",
      "fresnel-effect",
      "image-based-lighting",
      "albedo",
    ],
    demos: ["pbr-materials"],
  },
  {
    id: "metalness-roughness",
    title: "Metalness / Roughness Workflow",
    synonyms: ["metallic-roughness", "metal-rough workflow"],
    category: "shading-materials",
    difficulty: "intermediate",
    explanation:
      "This is the standard recipe for describing a PBR material with just a few intuitive sliders or textures: a base color, a metalness value saying whether the surface is metal (1) or not (0), and a roughness value from mirror-smooth (0) to completely matte (1). Almost any everyday material — plastic, gold, rubber, rust — can be expressed by varying these three across a surface.",
    whyItMatters:
      "It's the material format of glTF and virtually every modern engine, so understanding these three inputs lets you read or author almost any 3D asset.",
    analogy:
      "Describing any guitar tone with three amp knobs instead of wiring your own circuits: the knobs don't cover every exotic sound, but they're standardized, intuitive, and cover 95% of what anyone needs.",
    spotItInTheWild: [
      "Material sliders in Blender, Substance Painter, or three.js (`metalness`, `roughness`)",
      "glTF models loaded into an ArcGIS SceneView carrying metallic-roughness textures",
      "A rusty metal texture: the rust spots painted as metalness 0 and high roughness",
    ],
    deeperDive:
      "Metalness switches between two physical regimes. Dielectrics (metalness 0): base color feeds the diffuse term, and specular reflectance is a fixed ~0.04 (4%) white. Metals (metalness 1): there is no diffuse term at all — base color instead becomes the specular reflectance, which is why gold's reflections are golden. Roughness controls the width of the microfacet distribution (typically as GGX 'alpha' = roughness squared, a perceptually even remapping): low roughness gives tight, bright highlights and sharp reflections; high roughness spreads the same energy into a broad, dim sheen. The alternative specular/glossiness workflow stores explicit specular color instead but allows physically impossible combinations, which is why metal-rough won.",
    relatedTermIds: ["pbr", "albedo", "brdf", "fresnel-effect"],
    demos: ["pbr-materials"],
  },
  {
    id: "albedo",
    title: "Albedo",
    synonyms: ["base color", "diffuse color"],
    category: "shading-materials",
    difficulty: "basics",
    explanation:
      "Albedo is the intrinsic color of a surface — what fraction of red, green, and blue light it reflects rather than absorbs. Crucially, it contains no lighting: no shadows, no highlights, no shading. A brick's albedo is just 'brick red'; how bright that brick appears on screen is the renderer's job, computed from albedo plus the lights.",
    whyItMatters:
      "Keeping color and lighting separate is what lets one texture look right at noon, at sunset, and indoors — bake a shadow into your albedo and it's wrong everywhere else.",
    analogy:
      "A garment's dye color versus how it looks in a photo: the dye is the same whether you photograph it in sunlight or shade. Albedo is the dye; the photo is the rendered image.",
    spotItInTheWild: [
      "The 'Base Color' texture slot in Blender, Unity, or any glTF model",
      "Snow vs asphalt in satellite imagery — albedo is the same term climate scientists use",
      "Texture-authoring guides warning 'remove shadows from your photos before using them as albedo'",
    ],
    deeperDive:
      "In the metalness-roughness workflow the base color map is overloaded: for dielectrics it is the diffuse albedo; for metals it becomes the specular reflectance color. Physically plausible albedo values are bounded — nothing real is 0% or 100% reflective, so PBR guides recommend roughly 30–240 in 8-bit sRGB (charcoal sits near 0.04 linear, fresh snow near 0.9). Albedo textures are authored in sRGB and must be converted to linear space before lighting math, while data maps like roughness and normals stay linear — a classic source of 'washed out' material bugs.",
    demos: ["albedo"],
    relatedTermIds: ["pbr", "metalness-roughness", "texture-mapping", "gamma-correction"],
  },
  {
    id: "specular-vs-diffuse",
    title: "Specular vs Diffuse Reflection",
    synonyms: ["specular highlight", "diffuse reflection"],
    category: "shading-materials",
    difficulty: "basics",
    explanation:
      "When light hits a surface, it can bounce off in two characteristic ways. Diffuse reflection scatters it evenly in all directions — that's the soft, even color of chalk, fabric, or matte paint, which looks the same from any angle. Specular reflection bounces it in a mirror-like direction — that's the bright highlight on a billiard ball or the glare on water, which moves as you move. Most real materials are a mix of both.",
    whyItMatters:
      "This split is the foundation of every lighting model — nearly all material parameters are really just controlling the balance and sharpness of these two behaviors.",
    analogy:
      "Bouncing a tennis ball off concrete versus off deep gravel: concrete returns it crisply in one predictable direction (specular); gravel swallows the bounce and the ball could pop out anywhere (diffuse).",
    spotItInTheWild: [
      "The white glint sliding across a glossy apple as you rotate it — specular; the apple's red — diffuse",
      "Sun glare reflecting off water or glass roofs in a 3D city scene at the right camera angle",
      "Matte vs glossy photo paper holding the exact same image",
    ],
    deeperDive:
      "Diffuse reflection comes from light penetrating slightly, scattering among pigment particles, and re-exiting in random directions — well approximated by the Lambertian model, where brightness depends only on the angle between surface normal and light (the cosine term `N·L`), not the viewer. Specular reflection happens right at the surface boundary and is view-dependent: classic models put a highlight around the mirror direction (Phong, Blinn-Phong), while modern microfacet models derive its shape from roughness statistics. In PBR the two are coupled by energy conservation — light that reflects specularly isn't available to scatter diffusely — and metals drop the diffuse part entirely.",
    relatedTermIds: ["shading-models", "brdf", "fresnel-effect", "normal-vectors"],
    demos: ["shading-models"],
  },
  {
    id: "fresnel-effect",
    title: "Fresnel Effect",
    synonyms: ["fresnel reflectance", "grazing-angle reflection"],
    category: "shading-materials",
    difficulty: "intermediate",
    explanation:
      "The Fresnel effect says that how reflective a surface is depends on your viewing angle: looking straight on, most non-metals reflect only a few percent of light, but at a grazing angle almost everything becomes a mirror. You've seen it on any lake — clear water beneath your feet, blinding sky reflection toward the horizon. Every material exhibits it, so renderers that skip it look subtly plastic and wrong.",
    whyItMatters:
      "Fresnel is baked into every PBR shader because it's what makes water, glass, car paint, and even matte surfaces behave believably at the edges.",
    analogy:
      "Skipping stones: a stone thrown straight down plunges into the water, but thrown at a shallow grazing angle it bounces off the surface. Light does the same — steep angles go in, shallow angles reflect away.",
    spotItInTheWild: [
      "A lake reflecting mountains near the horizon but showing the bottom near the shore",
      "The bright rim around the silhouette of a glossy object in any PBR render",
      "Looking through a shop window straight-on vs seeing the street reflected at an angle",
    ],
    deeperDive:
      "The full Fresnel equations follow from light crossing a boundary between materials of different refractive indices; real-time graphics uses Schlick's approximation: `F = F0 + (1 - F0) * (1 - cos θ)^5`, where F0 is the reflectance at normal incidence and θ the angle between view and surface normal. For dielectrics F0 is around 0.02–0.05 (water 0.02, plastic 0.04, gemstones higher); for metals F0 is high and colored — this is exactly the value the metalness workflow derives from base color. Because F approaches 1 at grazing angles for everything, even rough concrete shows a faint horizon sheen. Fresnel-style view-angle terms also drive rim lighting, water shaders, and the reflectivity falloff in screen-space reflections.",
    demos: ["fresnel", "water-fresnel"],
    relatedTermIds: ["pbr", "specular-vs-diffuse", "brdf", "screen-space-reflections"],
  },
  {
    id: "normal-mapping",
    title: "Normal Mapping",
    synonyms: ["normal maps", "tangent-space normal map"],
    category: "shading-materials",
    difficulty: "intermediate",
    explanation:
      "Normal mapping fakes fine surface detail — scratches, bricks, pores, rivets — without adding any geometry. A special texture stores, for each point, which way the surface should pretend to face; the lighting math uses these tweaked directions instead of the flat triangle's real one. The surface stays geometrically flat, but light plays across it as if it were intricately sculpted.",
    whyItMatters:
      "It's how games show million-polygon detail on thousand-polygon models — one of the highest visual-payoff-per-cost tricks in real-time graphics.",
    analogy:
      "A theater backdrop painted with fake shadows and highlights so a flat canvas reads as carved stone — except a normal map repaints those cues live, correctly, for wherever the light actually is.",
    spotItInTheWild: [
      "The characteristic purple-blue textures in any game asset folder",
      "Brick walls in games that look deeply grooved until you view them edge-on and see they're flat",
      "Detailed glTF building models in 3D web scenes that stay light enough to stream",
    ],
    deeperDive:
      "A tangent-space normal map stores unit normals relative to the surface's local frame (tangent, bitangent, normal), remapped from [-1, 1] to RGB [0, 1] — hence the dominant blue, since 'unperturbed' (0, 0, 1) encodes as (128, 128, 255). The fragment shader rebuilds the TBN matrix from interpolated vertex data, transforms the sampled normal into world space, and feeds it to lighting. Maps are typically baked by ray-casting from a low-poly mesh to a multi-million-poly sculpt, capturing its detail. Limits: silhouettes stay polygonal, there's no self-occlusion or parallax, and at grazing angles the illusion thins — that's where parallax occlusion or displacement mapping take over. Normal maps are data, not color: store them linearly, never as sRGB.",
    demos: ["normal-mapping"],
    relatedTermIds: [
      "normal-vectors",
      "bump-mapping",
      "displacement-mapping",
      "texture-mapping",
      "uv-coordinates",
    ],
  },
  {
    id: "bump-mapping",
    title: "Bump Mapping",
    synonyms: ["bump maps", "height-based bump mapping"],
    category: "shading-materials",
    difficulty: "intermediate",
    explanation:
      "Bump mapping is the original 'fake detail with lighting' trick, from 1978: a grayscale texture stores height — white for raised, black for recessed — and the renderer tilts each point's apparent facing direction based on how steeply the heights change around it. Like normal mapping, nothing actually moves; the surface just shades as if it were bumpy.",
    whyItMatters:
      "It introduced the idea that surface detail can live in a texture instead of geometry — the ancestor of normal, parallax, and displacement mapping, and grayscale height maps remain a standard authoring format today.",
    analogy:
      "An embossed business card photographed under raking light: your eye reads raised letters purely from the shading, even though the photo itself is perfectly flat paper.",
    spotItInTheWild: [
      "The 'Bump' or 'Height' texture slot in Blender and other 3D tools",
      "Orange-peel paint and stucco walls in older games, built from tiled grayscale maps",
      "Procedural noise plugged in as bump to roughen up CG water or plastic",
    ],
    deeperDive:
      "Jim Blinn's original formulation perturbs the normal using the height field's partial derivatives: the gradient of the height texture tilts the geometric normal toward downhill, with a strength factor scaling the effect. In practice shaders sample the height map at neighboring texels (or use hardware derivatives) to estimate the gradient per fragment. Normal mapping is effectively the precomputed version — bake those derivatives once into an RGB map instead of computing them at runtime — which gives better quality and lets detail come from a sculpt rather than just a height field. The shared limitation stands: silhouettes, shadows, and parallax don't respond, because the geometry never changed.",
    demos: ["normal-mapping"],
    relatedTermIds: ["normal-mapping", "displacement-mapping", "normal-vectors", "texture-mapping"],
  },
  {
    id: "displacement-mapping",
    title: "Displacement Mapping",
    synonyms: ["displacement maps", "height displacement"],
    category: "shading-materials",
    difficulty: "advanced",
    explanation:
      "Displacement mapping stops faking and actually moves the geometry: a height texture pushes each vertex up or down along its facing direction, turning a flat plane into genuine ridges, cobblestones, or mountains. Because the shape really changes, silhouettes are bumpy, shadows fall correctly, and near surfaces hide far ones — everything normal and bump mapping can't deliver. The price is real geometry: the mesh must be dense enough (often via tessellation) to express the detail.",
    whyItMatters:
      "It's the technique behind believable terrain, film-quality surface detail, and any close-up where a flat-but-shaded surface would break the illusion.",
    analogy:
      "Bump and normal maps are trompe-l'oeil paintings of a relief; displacement actually carves the relief into the wall. Costlier, but it holds up when you look along the wall or cast a light across it.",
    spotItInTheWild: [
      "Terrain in 3D maps — an elevation raster displacing a flat grid is exactly how an ArcGIS SceneView builds its ground surface",
      "Tessellated brick roads and snow deformation in DirectX 11-era games",
      "Film VFX, where ZBrush-sculpted detail is applied at render time via displacement",
    ],
    deeperDive:
      "Real-time displacement typically runs in the tessellation stages: the hull/control shader decides subdivision density (often screen-space adaptive, so nearby patches get more triangles), the tessellator generates vertices, and the domain shader samples the height map and offsets each new vertex along the normal. Vertex-shader displacement on a pre-subdivided mesh is the simpler WebGL-friendly route — three.js exposes it directly as `displacementMap`. Offline renderers micro-displace down to sub-pixel polygons (REYES-style micropolygons). Common pitfalls: cracks along UV seams and patch edges where displaced neighbors disagree, normals needing recomputation after displacement, and shadow/physics meshes going out of sync with the displaced visual mesh. A standard hybrid keeps coarse shape in displacement and fine grain in a normal map.",
    demos: ["displacement"],
    relatedTermIds: [
      "tessellation",
      "normal-mapping",
      "bump-mapping",
      "terrain-rendering",
      "level-of-detail",
    ],
  },
];
