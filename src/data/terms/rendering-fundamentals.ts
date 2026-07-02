import type { TermInput } from "../types";

export const renderingFundamentals: TermInput[] = [
  {
    id: "rendering",
    title: "Rendering",
    synonyms: ["image synthesis"],
    category: "rendering-fundamentals",
    difficulty: "basics",
    explanation:
      "Rendering is the process of turning a 3D scene description — shapes, materials, lights, and a camera — into a 2D image you can show on a screen. Everything you see in a game, a 3D map, or an animated movie is the result of rendering, repeated for every frame.",
    whyItMatters:
      "Every other term in this glossary is a piece of this one process — rendering is the umbrella over all of it.",
    analogy:
      "A 3D scene is like a film set: props, lights, and a camera. Rendering is pressing the shutter — flattening that whole arrangement into a single photograph.",
    spotItInTheWild: [
      "A game drawing your view 60 times per second",
      "An ArcGIS SceneView turning city data into the picture on your monitor",
      "Pixar movies, where a single frame can take hours to render",
    ],
    deeperDive:
      "Renderers fall into two big families. Real-time renderers (games, map engines) use rasterization on the GPU and have a budget of a few milliseconds per frame. Offline renderers (film) typically use path tracing and can spend hours per frame chasing physical accuracy. Modern engines blur the line: real-time ray tracing hardware now brings offline techniques into interactive frame budgets.",
    demos: ["pipeline-diagram"],
    relatedTermIds: ["rasterization", "ray-tracing", "render-pipeline", "frame-rate"],
  },
  {
    id: "rasterization",
    title: "Rasterization",
    synonyms: ["scan conversion"],
    category: "rendering-fundamentals",
    difficulty: "basics",
    explanation:
      "Rasterization answers one question very fast: which pixels on the screen does this triangle cover? The GPU projects each triangle onto the screen, finds the covered pixels, and hands them to shading. It is the workhorse algorithm behind virtually all real-time graphics.",
    whyItMatters:
      "Rasterization is why your GPU can draw millions of triangles per frame — it's the speed king that makes real-time 3D possible at all.",
    analogy:
      "Lay a transparent grid over a hand-drawn triangle and color every cell whose center falls inside the lines. The grid is your screen; the cells are pixels.",
    spotItInTheWild: [
      "Every frame of every video game",
      "WebGL and WebGPU apps in your browser, including 3D web maps",
      "The jagged 'staircase' edges you see when anti-aliasing is off",
    ],
    deeperDive:
      "For each triangle, the GPU transforms its vertices to screen space, then walks the bounding region testing pixel centers against the triangle's edge equations. Covered pixels become fragments, which carry interpolated vertex attributes (depth, UVs, normals) to the fragment shader. Because each triangle is processed independently, the algorithm parallelizes almost perfectly — which is exactly what GPU hardware is built for. The trade-off: rasterization only knows about one triangle at a time, so global effects like reflections and indirect light need extra tricks.",
    relatedTermIds: ["ray-tracing", "render-pipeline", "anti-aliasing", "depth-buffer"],
    demos: ["rasterization", "vector-raster"],
  },
  {
    id: "ray-tracing",
    title: "Ray Tracing",
    synonyms: [],
    category: "rendering-fundamentals",
    difficulty: "intermediate",
    explanation:
      "Ray tracing renders an image by following light in reverse: for each pixel, it shoots a ray from the camera into the scene, finds what the ray hits, and then asks where that light came from — possibly bouncing further to mirrors, glass, or other surfaces. It naturally produces reflections, refractions, and accurate shadows that rasterization has to fake.",
    whyItMatters:
      "It's the technique behind film-quality lighting, and with RTX-class hardware it's increasingly inside real-time engines too.",
    analogy:
      "Imagine standing at the camera and tracing a laser pointer backwards through each pixel of a window screen, noting everything the beam touches and where its light originated.",
    spotItInTheWild: [
      "Accurate mirrors and glass in 'RTX on' games",
      "Almost every animated film and VFX shot of the last two decades",
      "Product renders in furniture catalogs that look suspiciously perfect",
    ],
    deeperDive:
      "Classic (Whitted) ray tracing spawns secondary rays only for perfect reflection, refraction, and shadow tests. Path tracing generalizes it: rays scatter probabilistically according to the surface's BRDF, and averaging many random paths per pixel converges to the physically correct answer — at the cost of noise that needs many samples or an AI denoiser. Hardware acceleration structures (BVHs) make ray–triangle intersection fast enough for hybrid real-time use.",
    demos: ["ray-lab", "hybrid-ray"],
    relatedTermIds: ["ray-casting", "path-tracing", "rasterization", "global-illumination"],
  },
  {
    id: "ray-casting",
    title: "Ray Casting",
    synonyms: ["picking", "hit testing"],
    category: "rendering-fundamentals",
    difficulty: "basics",
    explanation:
      "Ray casting shoots a single ray into the scene and reports the first thing it hits — no bouncing, no recursion. It's the simplest member of the ray family, used both as a rendering technique in early games and, today, mostly for answering questions like 'what did the user click on?'",
    whyItMatters:
      "Every time you click a building in a 3D map and it highlights, a ray cast just happened under your cursor.",
    analogy:
      "Pointing a laser pointer at a shelf and asking only: which object does the dot land on first?",
    spotItInTheWild: [
      "Click-to-select in 3D maps and editors (hitTest in the ArcGIS SDK)",
      "Wolfenstein 3D's entire renderer (one ray per screen column)",
      "Line-of-sight and bullet checks in game logic",
    ],
    deeperDive:
      "Rendering-wise, ray casting is ray tracing truncated at the first hit: primary rays only. That's why early 'raycasters' could run on 1992 CPUs — one intersection per column against a 2D grid. In modern engines the same operation, accelerated by spatial structures like BVHs or octrees, powers picking, collision probes, and visibility queries rather than image synthesis.",
    demos: ["ray-lab", "scene-picking"],
    relatedTermIds: ["ray-tracing", "frustum-culling"],
  },
  {
    id: "render-pipeline",
    title: "Render Pipeline",
    synonyms: ["graphics pipeline", "rendering pipeline"],
    category: "rendering-fundamentals",
    difficulty: "basics",
    explanation:
      "The render pipeline is the assembly line a GPU runs to turn triangles into pixels: vertex processing positions each corner point, rasterization finds covered pixels, fragment shading colors them, and output merging writes the survivors into the frame buffer. Some stages are programmable (you write shaders for them); others are fixed hardware.",
    whyItMatters:
      "Almost every performance question — and most visual artifacts — can be located at a specific stage of this pipeline.",
    analogy:
      "A car factory: chassis welding (vertices), panel stamping (rasterization), paint shop (fragment shading), and final assembly with quality control (depth test and blending).",
    spotItInTheWild: [
      "Shader compile stutter in games — the pipeline being rebuilt mid-play",
      "GPU profiler tools showing time per stage",
      "WebGPU's 'render pipeline' objects, which mirror these stages directly",
    ],
    deeperDive:
      "The canonical stages: vertex shader (model→world→view→clip transform), primitive assembly and clipping, rasterization, fragment shader, then per-fragment tests (scissor, stencil, depth) and blending into the frame buffer. Modern pipelines add optional stages — tessellation, geometry/mesh shaders — and compute shaders sit outside the pipeline entirely for general GPU work.",
    demos: ["pipeline-diagram", "scene-shader"],
    relatedTermIds: [
      "shader",
      "rasterization",
      "frame-buffer",
      "depth-buffer",
      "transformation-matrices",
    ],
  },
  {
    id: "frame-buffer",
    title: "Frame Buffer",
    synonyms: ["framebuffer", "render target", "color buffer"],
    category: "rendering-fundamentals",
    difficulty: "basics",
    explanation:
      "The frame buffer is the block of GPU memory holding the image currently being drawn — one color value per pixel, usually alongside companion buffers like depth. When a frame is finished, the frame buffer's contents are what get sent to your display.",
    whyItMatters:
      "Every effect that 'renders to texture' — shadows, reflections, post-processing — works by pointing the pipeline at a different frame buffer first.",
    analogy:
      "A painter's canvas that the whole pipeline paints onto. You can also keep several canvases backstage, paint intermediate images on them, and use those as reference material for the final piece.",
    spotItInTheWild: [
      "Screenshots — literally a copy of the frame buffer",
      "A security-camera monitor inside a game (a second frame buffer rendered from another viewpoint)",
      "Render-resolution settings: 1080p vs 4K is the frame buffer's size",
    ],
    deeperDive:
      "APIs expose this as a frame buffer object (FBO) with attachments: one or more color attachments, plus optional depth and stencil. Rendering to an off-screen FBO and sampling it as a texture is the backbone of shadow maps, post-processing chains, and deferred rendering (where geometry data itself is written to multiple render targets before lighting).",
    demos: ["pipeline-diagram", "scene-shader"],
    relatedTermIds: [
      "depth-buffer",
      "double-buffering",
      "render-pipeline",
      "screen-space-reflections",
    ],
  },
  {
    id: "depth-buffer",
    title: "Depth Buffer (Z-Buffer)",
    synonyms: ["z-buffer", "depth map"],
    category: "rendering-fundamentals",
    difficulty: "intermediate",
    explanation:
      "The depth buffer stores, for every pixel, how far away the surface drawn there is from the camera. When a new triangle wants to color a pixel, its depth is compared against the stored value — only closer surfaces win. This is how the GPU makes near objects correctly hide far ones, no matter what order triangles are drawn in.",
    whyItMatters:
      "Without it, distant mountains could draw on top of nearby buildings; with a poorly configured one, you get the infamous z-fighting flicker.",
    analogy:
      "A guest list where each pixel notes the closest visitor so far. New arrivals are only let in if they're standing nearer to the door than the name already on the list.",
    spotItInTheWild: [
      "Z-fighting: two co-planar surfaces flickering and shimmering as you move",
      "Fog and soft particle effects, which read scene depth",
      "Depth-of-field blur, driven by per-pixel depth",
    ],
    deeperDive:
      "Depth precision is non-linear: perspective projection maps depth to the buffer such that most precision bunches up near the near plane. A tiny near-plane value starves the rest of the range — the classic cause of z-fighting on distant geometry. Fixes: push the near plane out, use 32-bit float depth, use 'reversed-Z' (which distributes float precision far better), or offset co-planar geometry with polygon offset. Try all of this live in the playground.",
    relatedTermIds: ["frame-buffer", "rasterization", "camera-frustum", "render-pipeline"],
    demos: ["depth-buffer", "scene-zfight", "painters-order"],
  },
  {
    id: "double-buffering",
    title: "Double Buffering",
    synonyms: ["page flipping", "swap chain"],
    category: "rendering-fundamentals",
    difficulty: "basics",
    explanation:
      "With double buffering, the GPU draws the next frame into a hidden back buffer while the display shows the finished front buffer. When drawing completes, the two are swapped in an instant. This prevents you from ever watching a frame being half-drawn.",
    whyItMatters:
      "It's the reason animation looks like motion instead of a flickering construction site — and the root of concepts like vsync and swap chains.",
    analogy:
      "A theater with two stages on a turntable: while the audience watches one, stagehands build the next scene on the hidden one, then the turntable rotates in a snap.",
    spotItInTheWild: [
      "Screen tearing when vsync is off — a swap happening mid-scanout",
      "'Triple buffering' in game settings (one more backstage)",
      "Swap chain configuration in Vulkan/WebGPU code",
    ],
    deeperDive:
      "The swap is typically synchronized to the display's refresh (vsync) to avoid tearing; missing the deadline means waiting a whole refresh, which is why frame rates under vsync often snap to divisors (60 → 30). Triple buffering adds a second back buffer to decouple drawing from the swap deadline at the cost of one frame of latency. Variable-refresh displays (G-Sync/FreeSync) relax the fixed deadline entirely.",
    demos: ["frame-time"],
    relatedTermIds: ["frame-buffer", "frame-rate"],
  },
  {
    id: "frame-rate",
    title: "Frame Rate & Frame Time",
    synonyms: ["fps", "frames per second", "frame time"],
    category: "rendering-fundamentals",
    difficulty: "basics",
    explanation:
      "Frame rate counts how many images are rendered per second (fps); frame time measures how long one image took (milliseconds). They're two views of the same thing — 60 fps means about 16.7 ms per frame — but frame time is the one engineers watch, because spikes in it are what you feel as stutter.",
    whyItMatters:
      "Every rendering technique in this glossary is ultimately negotiating with one budget: the milliseconds available per frame.",
    analogy:
      "A flip-book: fps is how many pages flip per second; frame time is how long the artist gets to draw each page before it must flip.",
    spotItInTheWild: [
      "An fps counter in a game's corner",
      "'Performance' graphs in browser dev tools showing long frames as red bars",
      "A 3D map feeling smooth while orbiting (steady frame time) vs juddery (spiky)",
    ],
    deeperDive:
      "Average fps hides what matters: percentile frame times (the worst 1% of frames) determine perceived smoothness. A run at 90 fps average with occasional 80 ms frames feels worse than a locked 60. Real-time budgets divide further: at 16.7 ms total you might give 4 ms to shadows, 6 ms to the main pass, 3 ms to post-processing — which is why features like SSAO or soft shadows are always toggleable.",
    demos: ["frame-time", "map-frame-budget"],
    relatedTermIds: ["double-buffering", "draw-calls-batching", "level-of-detail"],
  },
  {
    id: "gpu-vs-cpu-rendering",
    title: "GPU vs CPU Rendering",
    synonyms: ["hardware acceleration", "software rendering"],
    category: "rendering-fundamentals",
    difficulty: "basics",
    explanation:
      "A CPU has a handful of fast, clever cores; a GPU has thousands of simple ones that all run the same program on different data at once. Rendering is exactly that kind of work — the same math for millions of pixels and vertices — so GPUs do it orders of magnitude faster. 'Software rendering' means doing it on the CPU anyway, which is flexible but slow.",
    whyItMatters:
      "It explains the division of labor in every engine: the CPU decides what to draw, the GPU does the drawing — and either one can be your bottleneck.",
    analogy:
      "Painting a stadium: the CPU is four master painters who can each improvise anything; the GPU is ten thousand people with rollers who finish the job in minutes as long as everyone follows the same instructions.",
    spotItInTheWild: [
      "'Hardware acceleration' toggles in browsers and video apps",
      "Offline render farms vs your graphics card running the same scene live",
      "Headless test environments falling back to software WebGL (SwiftShader)",
    ],
    deeperDive:
      "GPUs are throughput machines: wide SIMD units, thousands of threads in flight to hide memory latency, but poor at branching and serial logic. CPUs are latency machines: deep caches and branch prediction for irregular work like scene traversal and culling. The pipeline split follows: the CPU culls, sorts, and issues draw calls; the GPU transforms, rasterizes, and shades. 'CPU-bound' vs 'GPU-bound' tells you which side exhausted its frame budget first.",
    demos: ["gpu-race"],
    relatedTermIds: ["draw-calls-batching", "shader", "render-pipeline", "webgl-vs-webgpu"],
  },
];
