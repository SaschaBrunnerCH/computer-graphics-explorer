import type { TermInput } from "../types";

export const texturesSampling: TermInput[] = [
  {
    id: "texture-mapping",
    title: "Texture Mapping",
    synonyms: ["texturing"],
    category: "textures-sampling",
    difficulty: "basics",
    explanation:
      "Texture mapping wraps a 2D image around a 3D surface, so a flat photo of bricks can make a plain box look like a brick wall. Instead of modeling every brick as geometry, the renderer looks up a color from the image for each pixel it draws. It's the single biggest trick for making simple shapes look rich and detailed.",
    whyItMatters:
      "Without texture mapping, every 3D scene would be flat-colored plastic — it's how games and maps get photographic detail at almost no geometric cost.",
    analogy:
      "Gift-wrapping a box: the box's shape stays simple, but the printed paper wrapped around it carries all the visual detail.",
    spotItInTheWild: [
      "Satellite imagery draped over terrain in an ArcGIS SceneView",
      "Wood grain on furniture in games — usually a photo on flat polygons",
      "Faces of game characters, painted as 2D images and wrapped onto the head mesh",
    ],
    relatedTermIds: [
      "uv-coordinates",
      "texture-filtering",
      "mipmapping",
      "albedo",
      "normal-mapping",
    ],
    demos: ["texture-filtering", "basemap-mips"],
  },
  {
    id: "uv-coordinates",
    title: "UV Coordinates",
    synonyms: ["texture coordinates", "UVs", "UV mapping"],
    category: "textures-sampling",
    difficulty: "intermediate",
    explanation:
      "UV coordinates tell the renderer which point of a 2D texture belongs to each point of a 3D surface. Every vertex stores a (u, v) pair — a position in the image, where (0, 0) is one corner and (1, 1) the opposite — and the GPU blends these across each triangle to look up the right pixel of the texture. The letters U and V are used simply because X, Y, and Z were already taken by 3D positions.",
    whyItMatters:
      "Every textured surface you've ever seen depends on UVs — and most texture glitches, stretching, and visible seams are UV problems.",
    analogy:
      "A sewing pattern for a shirt: the flat paper pieces (the texture) are marked with exactly where each piece attaches to the 3D body. Bad markings and the fabric stretches or the seams don't line up.",
    spotItInTheWild: [
      "Stretched, smeared textures on steep cliff faces in games and 3D terrain",
      "Visible seams on a 3D globe where the left and right edges of the map image meet",
      "'UV unwrapping' tools in Blender, laying a 3D model out flat like a cardboard cut-out",
    ],
    deeperDive:
      "UVs are vertex attributes interpolated across triangles during rasterization — and the interpolation must be perspective-correct, dividing by depth, or textures swim on slanted surfaces (the classic PlayStation 1 wobble). Values outside the 0–1 range are handled by wrap modes: repeat tiles the image, clamp stretches the edge pixels, mirror alternates direction. Authoring good UVs means unwrapping a mesh into flat islands while balancing three enemies: distortion (stretching), seams (visible cuts), and wasted texture space between islands.",
    demos: ["uv-unwrap", "scene-uv"],
    relatedTermIds: ["texture-mapping", "texture-atlas", "texture-filtering", "vertex"],
  },
  {
    id: "mipmapping",
    title: "Mipmapping",
    synonyms: ["mip maps", "MIP levels", "mip chain"],
    category: "textures-sampling",
    difficulty: "intermediate",
    explanation:
      "Mipmapping stores a texture together with a chain of pre-shrunk copies — half size, quarter size, and so on down to a single pixel. When a textured surface is far away, the GPU samples from a smaller copy that roughly matches how big the surface appears on screen. This avoids the noisy shimmer you'd get from cramming a huge image into a few pixels, and it's faster too.",
    whyItMatters:
      "Mipmapping is why distant ground, roads, and buildings look calm and stable instead of sparkling with noise as the camera moves.",
    analogy:
      "Keeping the same photo printed at poster, postcard, and stamp sizes, and always viewing the print closest to your distance — instead of squinting at the poster from across the street.",
    spotItInTheWild: [
      "Imagery basemap tiles sharpening step by step as you zoom in on a 3D map — each zoom level is essentially a mip level",
      "Distant ground texture in games staying smooth instead of crawling with noise",
      "A 'texture quality' setting that drops the top mip levels to save GPU memory",
    ],
    deeperDive:
      "The mip chain is a precomputed answer to a sampling problem: when one screen pixel covers many texture pixels (texels), correct filtering would require averaging all of them every frame. Mips bake that averaging in advance — level n is a filtered half-resolution copy of level n−1, costing only 33% extra memory in total. The GPU picks the level from the on-screen size of the texture's footprint, using screen-space derivatives of the UVs, and trilinear filtering blends the two nearest levels to hide the switch. The name comes from the Latin 'multum in parvo' — much in little.",
    relatedTermIds: ["texture-filtering", "texture-mapping", "moire-patterns", "level-of-detail"],
    demos: ["texture-filtering", "basemap-mips", "imagery-filtering"],
  },
  {
    id: "texture-filtering",
    title: "Texture Filtering (Nearest / Bilinear / Trilinear / Anisotropic)",
    synonyms: [
      "nearest neighbor",
      "bilinear filtering",
      "trilinear filtering",
      "anisotropic filtering",
    ],
    category: "textures-sampling",
    difficulty: "intermediate",
    explanation:
      "A pixel on screen almost never lines up exactly with a pixel in the texture, so the GPU has to decide how to read between them. Nearest filtering just grabs the closest texture pixel (blocky), bilinear blends the four nearest ones (smooth), trilinear also blends between two mipmap sizes (no visible switching lines), and anisotropic takes extra samples on surfaces viewed at steep angles (sharp floors and roads stretching into the distance).",
    whyItMatters:
      "Filtering choice is the difference between crisp, stable surfaces and blocky, blurry, or shimmering ones — at a measurable performance cost per step up.",
    analogy:
      "Enlarging a small photo: nearest just makes each dot bigger (blocky), bilinear smoothly blends neighboring dots, and anisotropic is like a skilled retoucher who works hardest on the areas you view at a slant.",
    spotItInTheWild: [
      "Minecraft's deliberately blocky look — nearest filtering as an art style",
      "The 'Anisotropic Filtering: 2x/4x/8x/16x' option in nearly every game settings menu",
      "Roads and runways staying sharp toward the horizon in a 3D scene — or turning to mush when anisotropic filtering is off",
    ],
    deeperDive:
      "Filtering reconstructs a continuous image from discrete texels. Bilinear performs two horizontal lerps and one vertical lerp over a 2×2 texel block — cheap, dedicated hardware. Trilinear adds a third lerp between adjacent mip levels, removing the band where the level visibly changes. Both assume the pixel's footprint in texture space is roughly square; at grazing angles it's actually a long ellipse, so isotropic filters must blur (over-filtering the long axis) or alias. Anisotropic filtering takes up to 16 samples along the ellipse's major axis, keeping grazing surfaces sharp. Cost scales with samples, which is why it's exposed as 2x–16x quality tiers.",
    relatedTermIds: [
      "mipmapping",
      "texture-mapping",
      "uv-coordinates",
      "anti-aliasing",
      "moire-patterns",
    ],
    demos: ["texture-filtering", "imagery-filtering"],
  },
  {
    id: "texture-atlas",
    title: "Texture Atlas",
    synonyms: ["sprite sheet", "atlas packing"],
    category: "textures-sampling",
    difficulty: "intermediate",
    explanation:
      "A texture atlas packs many small images into one big texture, like photos arranged on a single poster. Objects then use UV coordinates to point at their own little region of the shared image. The payoff: the GPU can draw many different-looking objects without switching textures between them, which keeps draw calls cheap and few.",
    whyItMatters:
      "Atlases are a key trick for batching — drawing hundreds of differently textured objects in one go instead of hundreds of separate, expensive draw calls.",
    analogy:
      "A contact sheet of photo thumbnails: instead of handing the printer 100 separate photos one at a time, you hand over one sheet and say which rectangle to use for each print.",
    spotItInTheWild: [
      "Sprite sheets in 2D games — every animation frame of a character on one image",
      "Map icon sets, where all marker symbols live in a single atlas texture",
      "Textured city meshes in 3D scene layers, where many building facades share a few large atlas textures",
    ],
    deeperDive:
      "The classic failure mode is bleeding: bilinear filtering near a region's border blends in texels from the neighboring image, and mipmapping makes it worse because higher mip levels average ever-larger areas — eventually merging adjacent regions entirely. Mitigations include padding each region with gutter pixels that duplicate its edges, aligning regions to power-of-two blocks, and limiting how deep the mip chain goes. Texture arrays solve the same draw-call problem without bleeding by stacking same-sized layers, and bindless textures remove the binding bottleneck altogether on modern APIs — but atlases remain the portable workhorse, especially on the web.",
    demos: ["uv-unwrap", "sprite-atlas"],
    relatedTermIds: [
      "uv-coordinates",
      "draw-calls-batching",
      "texture-mapping",
      "mipmapping",
      "instancing",
    ],
  },
  {
    id: "anti-aliasing",
    title: "Aliasing & Anti-Aliasing (MSAA / FXAA / TAA)",
    synonyms: ["AA", "MSAA", "FXAA", "TAA", "jaggies"],
    category: "textures-sampling",
    difficulty: "intermediate",
    explanation:
      "A screen is a grid of pixels, and a smooth diagonal edge can't be represented exactly on a grid — so it turns into a staircase of jagged steps called aliasing. Anti-aliasing softens those steps, mainly by computing more than one sample per pixel or by cleverly blending edge pixels. MSAA takes extra geometric samples per pixel, FXAA smooths the finished image wherever it spots an edge, and TAA blends samples accumulated across several frames.",
    whyItMatters:
      "Jagged, crawling edges are one of the most distracting artifacts in real-time graphics — every game and 3D map engine ships some form of anti-aliasing to fight them.",
    analogy:
      "Drawing a diagonal line on graph paper by filling whole squares gives you a staircase. Anti-aliasing is allowing partially filled squares — shading each one by how much the line crosses it — so the eye reads a smooth line.",
    spotItInTheWild: [
      "The 'AA: Off / FXAA / TAA / MSAA 4x' choices in game graphics menus",
      "Building edges in a 3D city scene shimmering and crawling as you orbit the camera with AA off",
      "TAA's signature ghosting — faint trails behind fast-moving objects",
    ],
    deeperDive:
      "Aliasing is a signal-processing problem: the scene contains detail at higher frequency than the pixel grid can sample, and undersampling folds it into false patterns (the same root cause as moiré). Supersampling (SSAA) renders everything at higher resolution and downscales — correct but brutally expensive. MSAA runs the depth/coverage test at 4–8 sample positions per pixel but shades each triangle only once per pixel, fixing geometric edges cheaply, though it misses shader and texture aliasing and fits poorly with deferred renderers. FXAA is a cheap post-process that detects and blurs edges in the final image — fast, but it softens texture detail. TAA jitters the camera sub-pixel amounts each frame and accumulates history, resolving nearly all aliasing types, at the price of ghosting and blur; modern upscalers like DLSS and FSR are TAA's machine-learning descendants.",
    relatedTermIds: [
      "rasterization",
      "texture-filtering",
      "moire-patterns",
      "frame-buffer",
      "mipmapping",
    ],
    demos: ["anti-aliasing", "aa-lab"],
  },
  {
    id: "moire-patterns",
    title: "Moiré Patterns",
    synonyms: ["moiré", "interference patterns"],
    category: "textures-sampling",
    difficulty: "intermediate",
    explanation:
      "Moiré patterns are the strange wavy bands or rings that appear when a fine, regular pattern — a brick wall, a fence, a striped shirt — is displayed on a pixel grid that can't keep up with its detail. The pattern and the grid interfere, creating large fake ripples that were never in the original image, and they swim around as the camera moves. In graphics, moiré is the classic symptom of sampling a texture with too few pixels.",
    whyItMatters:
      "Moiré is the most visible warning sign of texture undersampling — and the artifact that mipmapping and good filtering exist to eliminate.",
    analogy:
      "Hold two window screens in front of each other and slide one slightly: big dark waves ripple across them, even though each screen alone is a perfectly even mesh. Two regular grids out of step create a third, phantom pattern.",
    spotItInTheWild: [
      "Striped shirts and window blinds flickering with rainbow ripples on TV broadcasts",
      "A long tiled floor or distant building facade in a 3D scene breaking into wavy rings when mipmapping is disabled",
      "Photographing a computer screen with your phone — the screen's pixel grid against the camera's sensor grid",
    ],
    deeperDive:
      "Moiré is aliasing with a recognizable face. The Nyquist limit says a sampled signal can only represent frequencies up to half the sampling rate; a distant checkerboard pushes texture detail far past what one sample per pixel can capture, and the excess frequency folds back ('aliases') into a low-frequency impostor — the visible ripples. The cure is to remove the unrepresentable frequencies before sampling: mipmapping does exactly that by pre-blurring the texture to match its on-screen footprint, trilinear filtering hides the level transitions, and anisotropic filtering handles the grazing-angle case where the footprint is highly elongated. Geometric edges alias by the same math, which is why anti-aliasing and mipmapping are two answers to one underlying problem.",
    relatedTermIds: ["mipmapping", "texture-filtering", "anti-aliasing", "texture-mapping"],
    demos: ["texture-filtering", "map-moire"],
  },
];
