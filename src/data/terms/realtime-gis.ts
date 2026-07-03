import type { TermInput } from "../types";

export const realtimeGis: TermInput[] = [
  {
    id: "webgl-vs-webgpu",
    title: "WebGL vs WebGPU",
    synonyms: ["WebGL", "WebGPU", "browser graphics APIs"],
    category: "realtime-gis",
    difficulty: "intermediate",
    explanation:
      "WebGL and WebGPU are the two ways a web page can talk to your graphics card. WebGL is the veteran: based on a 2007-era API (OpenGL ES), it's supported everywhere and powers most 3D on the web today. WebGPU is its modern successor — designed around how GPUs actually work now, with less driver overhead, compute shaders for general GPU work, and an API that maps cleanly to Vulkan, Metal, and Direct3D 12.",
    whyItMatters:
      "Every 3D web map, browser game, and online configurator runs on one of these two APIs — and the migration from one to the other is reshaping what's possible in a browser tab.",
    analogy:
      "WebGL is a classic car with a manual choke: it gets you there, but the engine hides a lot of quirks under decades of adapters. WebGPU is a new model built for today's roads — same destination, far less translation between you and the machine.",
    spotItInTheWild: [
      "An ArcGIS SceneView rendering a 3D city in your browser — WebGL today, with the industry moving toward WebGPU",
      "chrome://gpu showing which API your browser is using",
      "Compute-heavy demos (particle sims, ML in the browser) that require WebGPU",
    ],
    deeperDive:
      "WebGL is a state machine: you bind buffers and textures to global slots and the driver validates everything on every draw call, which makes per-draw CPU cost high. WebGPU replaces this with pre-validated pipeline objects and bind groups — expensive checks happen once at creation, so issuing thousands of draws per frame is far cheaper. It also adds first-class compute shaders (WebGL has none), storage buffers, and render bundles for replaying command sequences. For map engines that stream and process large datasets, the compute capability is as significant as the draw-call savings: terrain processing, culling, and decoding can move onto the GPU.",
    demos: ["gpu-race"],
    relatedTermIds: ["gpu-vs-cpu-rendering", "draw-calls-batching", "render-pipeline", "shader"],
  },
  {
    id: "draw-calls-batching",
    title: "Draw Calls & Batching",
    synonyms: ["draw call", "batching", "draw call overhead"],
    category: "realtime-gis",
    difficulty: "intermediate",
    explanation:
      "A draw call is the CPU telling the GPU 'draw this set of triangles with these settings.' Each one carries fixed overhead — the driver validates state, sets up the pipeline — so ten thousand tiny draw calls can choke a frame even if the triangles themselves are trivial. Batching merges many objects into fewer, bigger draw calls so the GPU spends its time drawing instead of waiting.",
    whyItMatters:
      "Draw call count is one of the most common real-world performance bottlenecks — a scene is often slow not because of too many triangles, but too many separate requests to draw them.",
    analogy:
      "Mailing 1,000 letters one at a time means 1,000 trips to the post office, each with its own queue. Batching is putting them all in one box and making a single trip.",
    spotItInTheWild: [
      "A web map combining thousands of building features from one tile into a single GPU buffer",
      "Game engine stats panels showing 'draw calls' or 'batches' right next to fps",
      "Texture atlases — one of their main purposes is letting objects share a draw call",
    ],
    deeperDive:
      "Overhead comes from state changes: every switch of shader, texture, or buffer between draws costs driver and pipeline work. Batching strategies attack this differently. Static batching pre-merges geometry that shares a material into one vertex buffer. Instancing draws N copies of the same mesh in one call with per-instance transforms — ideal for trees or repeated street furniture. Texture atlases and array textures remove texture switches so more objects can share a batch. Tiled map engines batch naturally: all features in a tile that share a renderer are uploaded as one buffer and drawn together, which is why a city of 100,000 buildings can render with a few hundred draw calls instead of 100,000.",
    demos: ["instancing", "tree-instancing"],
    relatedTermIds: ["instancing", "texture-atlas", "gpu-vs-cpu-rendering", "webgl-vs-webgpu"],
  },
  {
    id: "occlusion-culling",
    title: "Occlusion Culling",
    synonyms: ["visibility culling", "occlusion query"],
    category: "realtime-gis",
    difficulty: "intermediate",
    explanation:
      "Occlusion culling skips rendering objects that are hidden behind other objects — a building you can't see because a closer building covers it completely. The depth buffer would discard those pixels anyway, but only after the GPU has already done the work; occlusion culling avoids the work entirely. It complements frustum culling, which only removes things outside your view.",
    whyItMatters:
      "In a dense city scene, most of what's technically 'in front of the camera' is hidden behind something else — culling it can be the difference between a smooth frame and a slideshow.",
    analogy:
      "Standing in a crowd at a parade, you don't waste effort describing the people fully hidden behind the tall person in front of you — you simply can't see them, so they don't enter the picture.",
    spotItInTheWild: [
      "A street-level view in a 3D city scene staying fast even though thousands of buildings stand behind the ones you see",
      "Indoor game levels where rooms behind walls cost nothing until you open the door",
      "Profilers showing triangle counts plummet when the camera drops from bird's-eye to street level",
    ],
    deeperDive:
      "Classic approaches: precomputed visibility (PVS) divides a level into cells and stores which cells can see which — great for static indoor games, useless for streamed open worlds. Hardware occlusion queries ask the GPU 'would this bounding box's pixels survive the depth test?' but the answer arrives a frame late, causing pop-in if used naively. The modern favorite is the hierarchical Z-buffer (Hi-Z): render big occluders (or reproject last frame's depth), build a mip pyramid of farthest depths, and test each object's bounds against the appropriate mip level — cheap, GPU-friendly, and a natural fit for GPU-driven pipelines where the GPU culls its own work.",
    demos: ["scene-streaming"],
    relatedTermIds: ["frustum-culling", "depth-buffer", "backface-culling", "level-of-detail"],
  },
  {
    id: "terrain-rendering",
    title: "Terrain Rendering",
    synonyms: ["heightmap rendering", "elevation rendering"],
    category: "realtime-gis",
    difficulty: "intermediate",
    explanation:
      "Terrain rendering turns elevation data — essentially a grayscale image where brightness means height — into the 3D ground surface you fly over in a map or game. The engine builds a triangle mesh from the height values, drapes imagery or textures over it, and constantly adjusts detail so nearby terrain is finely tessellated while distant mountains use just a few big triangles.",
    whyItMatters:
      "The ground is the one object in every outdoor scene, often spanning an entire planet — rendering it efficiently is a foundational problem for both games and 3D mapping.",
    analogy:
      "A relief map made from a stack of graph paper: each sheet tells you how high to push up each grid cell. Use fine graph paper near your eye, coarse paper for the horizon, and glue the seams so no gaps show.",
    spotItInTheWild: [
      "An ArcGIS SceneView draping satellite imagery over a world elevation service as you tilt the camera",
      "Open-world games with mountains visible dozens of kilometers away",
      "Hillshade and contour visualizations computed from the same elevation data",
    ],
    deeperDive:
      "Web-scale engines stream elevation as heightmap tiles in a quadtree: each tile covers a square of the world, and each level down splits it into four tiles with twice the resolution. Tiles are chosen per frame by screen-space error — a tile subdivides when its coarseness would be visible at the current camera distance. Adjacent tiles at different LODs don't share vertices along their border, which causes cracks: thin gaps where the meshes disagree. The standard fixes are skirts (each tile extends a short curtain of triangles downward around its edge, hiding gaps) or stitching (adjusting edge vertices to match the coarser neighbor). Imagery tiles stream through the same quadtree, so texture and geometry detail stay in step.",
    demos: ["terrain-exaggeration", "map-hillshade"],
    relatedTermIds: [
      "level-of-detail",
      "displacement-mapping",
      "tessellation",
      "elevation-exaggeration",
      "i3s-3d-tiles",
    ],
  },
  {
    id: "elevation-exaggeration",
    title: "Elevation Exaggeration",
    synonyms: ["vertical exaggeration", "terrain exaggeration"],
    category: "realtime-gis",
    difficulty: "basics",
    explanation:
      "Elevation exaggeration multiplies terrain heights by a factor — say 2× or 5× — so hills and valleys stand out more than they do in reality. Real landscapes are surprisingly flat at map scales: even the Alps are shallow bumps when you view a whole country. Exaggeration trades physical accuracy for legibility, making subtle relief actually visible.",
    whyItMatters:
      "Many landforms — river valleys, fault lines, gentle ridges — are nearly invisible at true scale, so exaggeration is often the difference between seeing the story in the terrain and seeing a pancake.",
    analogy:
      "A caricature artist exaggerates a person's most distinctive features so you recognize them instantly. Exaggerated terrain does the same for landscapes: not literally true, but more recognizable than the literal version.",
    spotItInTheWild: [
      "A SceneView with the elevation layer's exaggeration turned up so a study area's drainage pattern pops",
      "Seafloor visualizations, where ocean trenches would look flat without heavy exaggeration",
      "Museum relief globes and airline seat-back terrain maps, almost always exaggerated",
    ],
    deeperDive:
      "Implementation is a vertical scale applied when terrain geometry is generated — heights are multiplied before the mesh is built, so lighting, normals, and draped imagery all follow the exaggerated surface consistently. Pitfalls: exaggeration distorts slope-dependent analysis (a 2× exaggerated 10° slope renders like 20°), and 3D objects placed on the surface must be re-anchored or they float or sink. Choosing a factor is cartographic judgment: regional overviews often use 2–5×, planetary or bathymetric views more, and engineering or line-of-sight work should stay at 1× so measurements remain honest.",
    demos: ["terrain-exaggeration", "map-hillshade"],
    relatedTermIds: ["terrain-rendering", "displacement-mapping", "normal-vectors"],
  },
  {
    id: "atmosphere-rendering",
    title: "Atmosphere Rendering",
    synonyms: ["atmospheric scattering", "aerial perspective", "sky rendering"],
    category: "realtime-gis",
    difficulty: "intermediate",
    explanation:
      "Atmosphere rendering simulates how air affects light: it makes the sky blue, sunsets orange, and distant mountains pale and hazy. Sunlight scatters off air molecules and aerosols on its way to your eye, so the farther away something is, the more its colors wash toward the sky's color. Rendering this — even approximately — is what makes an outdoor scene read as outdoors.",
    whyItMatters:
      "Atmospheric haze is one of the strongest depth cues humans have — without it, a rendered globe looks like a model on a desk instead of a planet seen from above.",
    analogy:
      "Looking down a long valley, each ridge is a paler, bluer version of the one before — as if every kilometer of air slipped one more sheet of blue tracing paper between you and the view.",
    spotItInTheWild: [
      "The blue limb of the Earth and the horizon haze when you zoom out in an ArcGIS SceneView with atmosphere enabled",
      "Open-world games where distant terrain fades toward the sky color (aerial perspective)",
      "Flight simulators rendering sunrise from the stratosphere",
    ],
    deeperDive:
      "Physically, two scattering models dominate: Rayleigh scattering from air molecules, which is strongly wavelength-dependent (blue scatters most — hence blue skies, and red sunsets once the blue has been scattered away along a long horizon path) and Mie scattering from aerosols, which is wavelength-neutral and forms the bright haze around the sun. Real-time implementations integrate these along the view ray through a model of air density falling off with altitude; modern engines precompute the integrals into lookup tables (Bruneton-style precomputed atmospheric scattering) so a full planetary atmosphere costs a couple of texture fetches per pixel. Simpler engines approximate the depth-cue part with distance fog blended toward a sky color, which captures aerial perspective if not the physics.",
    relatedTermIds: ["specular-vs-diffuse", "hdr", "tone-mapping", "depth-buffer"],
    demos: ["atmosphere-fog"],
  },
  {
    id: "mesh-simplification",
    title: "Mesh Simplification",
    synonyms: ["decimation", "polygon reduction", "mesh reduction"],
    category: "realtime-gis",
    difficulty: "intermediate",
    explanation:
      "Mesh simplification automatically reduces a 3D model's triangle count while keeping its shape as intact as possible. A photogrammetry scan of a building might arrive with two million triangles; simplification can cut that to twenty thousand that look nearly identical from a distance. It's how the lower-detail versions used by level-of-detail systems get made.",
    whyItMatters:
      "Scanned and generated meshes are almost always far denser than rendering needs — simplification is the step that turns raw capture data into something a GPU can stream and draw in real time.",
    analogy:
      "Summarizing a 500-page novel into a 5-page synopsis: you drop enormous amounts of detail, but you choose what to drop so the plot — the silhouette of the story — survives.",
    spotItInTheWild: [
      "An integrated mesh scene layer of a photogrammetry-scanned city, where each LOD level is a simplified version of the one below",
      "Game asset pipelines auto-generating LOD1/LOD2/LOD3 from the artist's full-detail model",
      "Distant buildings in a 3D map quietly swapping to chunkier geometry as you zoom out",
    ],
    deeperDive:
      "The workhorse algorithm is iterative edge collapse with quadric error metrics (Garland-Heckbert): every edge gets a cost measuring how far the merged vertex would drift from the original surface's planes, and the cheapest edges collapse first until the triangle budget is met. Production pipelines must simultaneously preserve appearance attributes — UV seams, vertex normals, material boundaries — since a geometrically tiny collapse can still smear a texture. For streamed multi-LOD content, simplification runs per node of the spatial tree, and texture detail is reduced in step with geometry so neither wastes the other's savings. Newer approaches like Nanite sidestep discrete LODs by precomputing a hierarchy of simplified clusters and picking per-cluster detail at render time.",
    demos: ["scene-streaming", "tile-generalization"],
    relatedTermIds: ["level-of-detail", "triangle-mesh", "i3s-3d-tiles", "vertex"],
  },
  {
    id: "i3s-3d-tiles",
    title: "I3S & 3D Tiles Streaming",
    synonyms: ["I3S", "3D Tiles", "scene layers", "3D streaming formats"],
    category: "realtime-gis",
    difficulty: "intermediate",
    explanation:
      "I3S and 3D Tiles are open formats for streaming massive 3D geospatial content — whole cities of buildings, photogrammetry meshes, billions of lidar points — over the web. Instead of downloading one giant model, the dataset is pre-chopped into a tree of small chunks at multiple detail levels, and the client fetches only the chunks the current camera view needs, at the detail it needs.",
    whyItMatters:
      "These formats are why a browser on a laptop can fly through a textured 3D scan of an entire metropolitan area that would never fit in memory as a single file.",
    analogy:
      "Streaming video: you never download the whole movie, just the next few seconds at a quality matched to your bandwidth. I3S and 3D Tiles do the same with geometry — the 'next few seconds' is whatever your camera is looking at.",
    spotItInTheWild: [
      "An ArcGIS SceneView loading a building scene layer: coarse blocks appear first, then refine as tiles stream in",
      "Google's Photorealistic 3D Tiles bringing globe-scale photogrammetry into third-party apps",
      "Lidar point cloud scene layers showing more points as you zoom into a scan",
    ],
    deeperDive:
      "Both are OGC community standards solving the same problem with similar machinery: I3S (Indexed 3D Scene Layers, originated by Esri, serving 'scene layers') and 3D Tiles (originated by Cesium). Each organizes content as a spatial tree — nodes (I3S) or tiles (3D Tiles) with bounding volumes, where children cover the parent's region at higher detail. Traversal is driven by screen-space error: each node stores a geometric error describing how coarse it is, the client projects that error to pixels for the current camera, and refines down the tree until the error is below threshold — distant areas stop at coarse nodes while nearby ones refine deep. Payloads carry compressed meshes and textures (3D Tiles uses glTF with Draco/KTX2 compression; I3S uses similar binary geometry buffers) plus per-feature attributes so individual buildings stay identifiable and queryable. The layer types map onto the tree too: 3D objects, integrated meshes, point clouds, and points are all the same streaming pattern with different payloads.",
    demos: ["scene-streaming"],
    relatedTermIds: [
      "level-of-detail",
      "mesh-simplification",
      "terrain-rendering",
      "frustum-culling",
      "texture-atlas",
    ],
  },
  {
    id: "edge-rendering",
    title: "Edge / Sketch Rendering",
    synonyms: ["edge rendering", "outline rendering", "contour lines", "sketch effect"],
    category: "realtime-gis",
    difficulty: "intermediate",
    explanation:
      "Edge rendering draws lines along the important creases and silhouettes of 3D objects — the corners of a building, the outline of a roof — instead of or in addition to shaded surfaces. It borrows from how humans sketch: a few well-chosen lines communicate shape better than acres of flat gray. Styles range from crisp architectural edges to wobbly hand-drawn 'sketch' looks.",
    whyItMatters:
      "Untextured 3D models — like planned buildings in an urban design study — can read as featureless blobs; edges restore the visual structure that makes them legible.",
    analogy:
      "An architect's line drawing of a house tells you more about its form than an out-of-focus photo — the lines sit exactly where your eye needs information: corners, silhouettes, and creases.",
    spotItInTheWild: [
      "ArcGIS SceneView edge rendering: white untextured city buildings with 'solid' or 'sketch' edges, the signature urban-planning look",
      "Cel-shaded games like Zelda: The Wind Waker or Borderlands with their inked outlines",
      "CAD and BIM viewers showing hidden-line or wireframe-over-shaded views",
    ],
    deeperDive:
      "Two main implementation families. Geometry-based methods analyze the mesh: an edge is a crease if the angle between its two adjacent face normals exceeds a threshold, and a silhouette if one face points toward the camera and the other away — found edges are extruded into camera-facing ribbons of triangles so they have controllable width. Screen-space methods instead run a post-process edge detector over the depth and normal buffers, drawing a line wherever neighbors differ sharply. The ArcGIS SceneView takes the geometry-based route for SceneLayer and mesh symbology: edge geometry is extracted from the 3D object or building content and rendered as styled lines ('solid' or hand-drawn-looking 'sketch'), with size, color, and transparency controls, and extension-line treatment that keeps edges readable as the camera moves. Geometry-based edges stay crisp under motion; screen-space edges are cheaper and catch everything but inherit the frame buffer's resolution and aliasing.",
    demos: ["edge-rendering"],
    relatedTermIds: ["normal-vectors", "depth-buffer", "shading-models", "anti-aliasing"],
  },
];
