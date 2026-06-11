import type { TermInput } from "../types";

export const geometryScene: TermInput[] = [
  {
    id: "vertex",
    title: "Vertex",
    synonyms: ["vertices", "point"],
    category: "geometry-scene",
    difficulty: "basics",
    explanation:
      "A vertex is a single point in 3D space — one corner of a triangle. But it carries more than a position: each vertex can also store a normal direction, a texture coordinate, a color, and anything else the renderer needs at that corner. Every 3D model, from a cube to a city, is ultimately a long list of vertices.",
    whyItMatters:
      "Vertex count is one of the first numbers artists and engineers look at — it drives memory use, download size, and how much work the GPU's first pipeline stage has to do.",
    analogy:
      "A connect-the-dots puzzle: the numbered dots are vertices, and the lines you draw between them form the shape. The dots alone define everything — the picture is just how you join them.",
    spotItInTheWild: [
      "A 'vertices: 2.4M' readout in a 3D editor like Blender",
      "Wireframe view in a game's debug mode — every line meets at a vertex",
      "Vertex counts in a SceneView's performance info while loading a 3D city",
    ],
    deeperDive:
      "On the GPU, vertices live in vertex buffers: tightly packed arrays of attributes (position, normal, UV, color) with a layout the pipeline is told how to read. The vertex shader runs once per vertex, transforming it into clip space and passing attributes onward to be interpolated across each triangle. Because identical corners are often shared by many triangles, an index buffer lets triangles reference the same vertex by number instead of duplicating it — typically cutting memory use by half or more.",
    relatedTermIds: ["triangle-mesh", "normal-vectors", "shader", "transformation-matrices"],
  },
  {
    id: "triangle-mesh",
    title: "Polygon / Triangle Mesh",
    synonyms: ["polygon mesh", "mesh", "triangulation"],
    category: "geometry-scene",
    difficulty: "basics",
    explanation:
      "A mesh is a 3D surface built from many small flat polygons — almost always triangles — stitched together edge to edge. Triangles are the universal building block because three points always lie on a single flat plane, which makes them unambiguous and cheap for the GPU to draw. Curved surfaces are just an illusion created by using lots of small triangles.",
    whyItMatters:
      "Virtually everything a GPU renders — characters, terrain, buildings, even text — is a triangle mesh by the time it reaches the hardware.",
    analogy:
      "A geodesic dome or a disco ball: a round-looking object that, up close, is clearly made of small flat facets. Use enough facets and the eye reads it as a smooth curve.",
    spotItInTheWild: [
      "Low-poly art styles that show their triangles on purpose",
      "Building meshes in a 3D city scene, streamed as triangles to your browser",
      "The faceted silhouette of a 'round' object in an older game",
    ],
    deeperDive:
      "A mesh is stored as a vertex buffer (the points) plus an index buffer (which triples of vertices form triangles), letting shared corners be stored once. Quads and n-gons exist in modeling tools for clean editing, but they're triangulated before rendering since GPUs only rasterize triangles. Mesh quality matters beyond count: long thin 'sliver' triangles rasterize inefficiently and cause shading artifacts, and a watertight mesh (no gaps or holes) is required for things like shadows and boolean operations to behave.",
    relatedTermIds: [
      "vertex",
      "normal-vectors",
      "tessellation",
      "mesh-simplification",
      "rasterization",
    ],
  },
  {
    id: "normal-vectors",
    title: "Normal Vectors",
    synonyms: ["surface normal", "normals"],
    category: "geometry-scene",
    difficulty: "basics",
    explanation:
      "A normal is an arrow that points straight out of a surface, perpendicular to it — it tells the renderer which way the surface is facing. Lighting depends on it directly: a surface facing the light is bright, one facing away is dark. Normals stored at each vertex can be smoothly blended across a triangle, which is how flat triangles manage to look curved.",
    whyItMatters:
      "Almost every lighting calculation starts with the normal — wrong or missing normals are the number one reason a model shows up black, inside-out, or weirdly faceted.",
    analogy:
      "Sundials on a hillside: plant a stick perpendicular to the ground at every point, and the angle each stick makes with the sun tells you how strongly that spot is lit.",
    spotItInTheWild: [
      "A model that imports looking pitch black or inside-out — flipped normals",
      "The smooth vs flat shading toggle in any 3D tool",
      "Terrain in a 3D map shading realistically as the sun direction changes",
    ],
    deeperDive:
      "Face normals come straight from a triangle's geometry (the cross product of two edges); vertex normals are usually an average of the surrounding face normals, and the choice between sharing or splitting them at edges is exactly the difference between smooth and hard edges. During rendering, vertex normals are interpolated across the triangle and renormalized per pixel, then fed into the shading model's dot products. Normal mapping pushes the idea further: a texture overrides the interpolated normal per pixel to fake fine detail that isn't in the geometry.",
    relatedTermIds: [
      "vertex",
      "triangle-mesh",
      "shading-models",
      "normal-mapping",
      "backface-culling",
    ],
  },
  {
    id: "scene-graph",
    title: "Scene Graph",
    synonyms: ["scene hierarchy", "node tree"],
    category: "geometry-scene",
    difficulty: "basics",
    explanation:
      "A scene graph organizes everything in a 3D scene as a tree: a car node contains four wheel nodes, a street node contains many car nodes, and so on. Each node's position is expressed relative to its parent, so moving the car automatically moves its wheels. It's how engines keep thousands of objects organized and movable as groups.",
    whyItMatters:
      "It's the data structure that makes 'move the whole city block' a one-line operation instead of a thousand — and the tree the renderer walks to decide what to draw.",
    analogy:
      "Folders on your computer: move a folder and everything inside moves with it, because each item's location is defined relative to its parent folder.",
    spotItInTheWild: [
      "The hierarchy/outliner panel in Unity, Blender, or any 3D editor",
      "Layers containing graphics in a SceneView — a scene graph you script against",
      "A character's hand following its arm following its shoulder in animation",
    ],
    deeperDive:
      "Each node stores a local transformation matrix; a node's world transform is the product of all matrices from the root down, computed in a single tree traversal. The same traversal is a natural place to hang other per-node work: accumulating bounding volumes for culling, toggling visibility (hiding a node hides its subtree), and collecting draw calls. Engines increasingly separate the logical hierarchy from the render list, though — a flat, cache-friendly array of draw items often beats walking pointers through a deep tree every frame.",
    relatedTermIds: ["transformation-matrices", "frustum-culling", "level-of-detail"],
  },
  {
    id: "transformation-matrices",
    title: "Transformation Matrices (Model / View / Projection)",
    synonyms: ["MVP matrices", "model view projection"],
    category: "geometry-scene",
    difficulty: "intermediate",
    explanation:
      "A transformation matrix is a small grid of numbers (4×4) that can move, rotate, and scale a 3D point — all in one multiplication. Rendering chains three of them: the model matrix places an object in the world, the view matrix re-expresses the world from the camera's point of view, and the projection matrix squeezes that view into the screen, adding perspective. Every vertex of every frame takes this trip.",
    whyItMatters:
      "This matrix chain is the mathematical core of all 3D rendering — it's how a vertex stored once in a model file ends up at the right pixel from any camera angle.",
    analogy:
      "Photographing a chess piece: first you place the piece on the board (model), then you choose where to stand and aim the camera (view), then the lens flattens the 3D scene onto the photo with near things large and far things small (projection).",
    spotItInTheWild: [
      "The 'gizmo' arrows for moving and rotating objects in any 3D editor",
      "A 3D map smoothly orbiting a city — only the view matrix is changing",
      "uniform mat4 mvpMatrix near the top of almost every vertex shader",
    ],
    deeperDive:
      "The magic ingredient is homogeneous coordinates: a 4th component `w` lets a single 4×4 matrix encode translation (impossible with 3×3) and perspective division. Matrices compose by multiplication, so `MVP = P × V × M` is precomputed once per object and applied to every vertex in the vertex shader; after it, dividing by `w` performs the perspective foreshortening. Order matters — matrix multiplication doesn't commute, so rotate-then-translate and translate-then-rotate land an object in different places. In a scene graph, each node's model matrix is the product of its ancestors' local matrices.",
    relatedTermIds: ["camera-frustum", "scene-graph", "vertex", "render-pipeline"],
  },
  {
    id: "camera-frustum",
    title: "Camera Frustum",
    synonyms: ["view frustum", "viewing volume"],
    category: "geometry-scene",
    difficulty: "basics",
    explanation:
      "The camera frustum is the 3D region of space the camera can actually see — shaped like a pyramid with its pointy tip cut off. The cut happens at the near plane (things closer than this are too close to draw) and the far plane (things beyond this are too far). Only objects inside this volume can ever appear in the final image.",
    whyItMatters:
      "The frustum defines what's worth rendering at all, and its near/far planes directly control depth precision — set them carelessly and distant geometry starts to flicker.",
    analogy:
      "The beam of a flashlight in fog: a cone of visibility spreading out from the lens. Everything inside the beam is in view; everything outside it might as well not exist.",
    spotItInTheWild: [
      "Objects 'popping' out of view at screen edges as you turn a game camera",
      "Distant terrain fading at the far plane in an open-world game or 3D map",
      "Geometry vanishing when the camera gets extremely close — clipped at the near plane",
    ],
    deeperDive:
      "The frustum is fully described by the projection matrix: field of view and aspect ratio set the pyramid's spread, near and far planes cap it. Its six bounding planes (left, right, top, bottom, near, far) are what culling tests objects against. Depth-buffer precision is distributed between near and far non-linearly — most of it bunches up near the near plane — which is why globe-scale viewers like a SceneView adjust the near plane dynamically as you zoom from orbit down to street level.",
    relatedTermIds: ["frustum-culling", "transformation-matrices", "depth-buffer"],
    demos: ["frustum-culling"],
  },
  {
    id: "frustum-culling",
    title: "Frustum Culling",
    synonyms: ["view frustum culling"],
    category: "geometry-scene",
    difficulty: "intermediate",
    explanation:
      "Frustum culling skips drawing objects that are entirely outside the camera's view volume. Before issuing draw commands, the engine tests each object's simple bounding shape (a box or sphere) against the frustum — if it's fully outside, the object is dropped for this frame. The camera can't see it, so why spend any GPU time on it?",
    whyItMatters:
      "In a large scene, the camera typically sees only a small slice of the world — culling the rest is often the single biggest performance win an engine gets for free.",
    analogy:
      "Packing for a day trip instead of hauling your whole wardrobe: you only take what you'll actually use. The rest of your clothes still exist at home — you just don't carry them around.",
    spotItInTheWild: [
      "A city SceneView staying smooth even though the full dataset has millions of buildings — only the visible slice is drawn",
      "Game debug overlays showing 'rendered: 1,204 / 38,000 objects'",
      "Frame rate climbing when you point the camera at the sky in an open-world game",
    ],
    deeperDive:
      "The test is plane-based: an object's bounding sphere or axis-aligned bounding box is checked against the frustum's six planes, and one fully-outside result rejects it. Testing every object individually doesn't scale, so engines organize space hierarchically — octrees, BVHs, or quadtree tiles in map engines — and cull whole branches at once: if a parent volume is outside, thousands of children are skipped without a single test. Note what it doesn't solve: objects inside the frustum but hidden behind others still get drawn; that's occlusion culling's job.",
    relatedTermIds: [
      "camera-frustum",
      "occlusion-culling",
      "backface-culling",
      "scene-graph",
      "draw-calls-batching",
    ],
    demos: ["frustum-culling"],
  },
  {
    id: "backface-culling",
    title: "Backface Culling",
    synonyms: ["back-face culling", "face culling"],
    category: "geometry-scene",
    difficulty: "intermediate",
    explanation:
      "On a closed object like a cube or a building, you can never see the triangles facing away from you — the front of the object blocks them. Backface culling has the GPU detect and discard those triangles before any pixel work happens, instantly halving the shading load for solid objects. It costs almost nothing: just a quick check of which way each triangle winds on screen.",
    whyItMatters:
      "It's a free 2x discount on pixel work for solid geometry — enabled by default in virtually every real-time engine.",
    analogy:
      "Looking at a globe: you can only ever see the hemisphere facing you. There's no point printing the far side of the map for someone who can't possibly see it.",
    spotItInTheWild: [
      "Walking 'inside' an object in a game and seeing right through its walls — you're looking at culled back faces",
      "Single-sided leaves or fences disappearing from behind in older games",
      "A 'double-sided' material checkbox in 3D tools — it turns culling off for that surface",
    ],
    deeperDive:
      "The GPU decides front vs back from the winding order of a triangle's vertices after projection to the screen: counter-clockwise is conventionally front-facing, clockwise is back-facing (both are configurable). This happens at primitive assembly, before rasterization, so culled triangles never produce fragments. It assumes meshes are closed with consistent winding — open geometry like foliage, cloth, or thin walls needs culling disabled or geometry doubled, and shaders can read a built-in front-facing flag to shade the two sides differently.",
    relatedTermIds: ["normal-vectors", "triangle-mesh", "frustum-culling", "rasterization"],
  },
  {
    id: "level-of-detail",
    title: "Level of Detail (LOD)",
    synonyms: ["LOD", "lod levels"],
    category: "geometry-scene",
    difficulty: "intermediate",
    explanation:
      "Level of detail means keeping several versions of the same object — a detailed one, a medium one, and a rough one — and picking which to draw based on distance. A building ten kilometers away covers a handful of pixels, so spending fifty thousand triangles on it is pure waste; a fifty-triangle version looks identical at that size. As the camera moves closer, the engine swaps in finer versions.",
    whyItMatters:
      "LOD is what makes huge worlds possible at all — without it, a whole-city or whole-planet view would mean rendering every screw and window frame at full detail simultaneously.",
    analogy:
      "Map zoom levels: a country view shows cities as dots; zoom in and the dots become street networks, then individual buildings. Nobody draws every street on the country-level map.",
    spotItInTheWild: [
      "Terrain and 3D buildings in a SceneView sharpening tile by tile as you zoom in",
      "Trees in open-world games visibly 'popping' to higher detail as you approach",
      "Distant crowds rendered as simple flat cutouts (impostors) in stadium scenes",
    ],
    deeperDive:
      "Selection is usually driven by projected screen size or a screen-space error metric — how many pixels wrong the coarse version could be — rather than raw distance. The visible 'pop' at switches is softened by cross-fading or geomorphing (animating vertices between levels). Streamed formats like I3S and 3D Tiles bake the idea into their structure: a tree of tiles where each level holds a coarser representation of its children, so the viewer loads and renders only the detail the current camera can actually perceive. The same idea applied to textures is mipmapping.",
    relatedTermIds: [
      "mesh-simplification",
      "i3s-3d-tiles",
      "mipmapping",
      "terrain-rendering",
      "frustum-culling",
    ],
    demos: ["lod"],
  },
  {
    id: "tessellation",
    title: "Tessellation",
    synonyms: ["subdivision"],
    category: "geometry-scene",
    difficulty: "advanced",
    explanation:
      "Tessellation is splitting geometry into more, smaller triangles — often done by the GPU on the fly. Instead of shipping a model with millions of triangles, you send a coarse mesh and let dedicated hardware subdivide it just before rendering, adding detail exactly where the camera needs it. Combined with a displacement texture, those new triangles can be pushed outward into real bumps and ridges.",
    whyItMatters:
      "It decouples stored detail from rendered detail — a small downloadable mesh can become a finely sculpted surface at render time, with density that adapts to the camera.",
    analogy:
      "Pixelated image enlargement vs vector art: a coarse mesh is like vector art — you can subdivide it to any density you need at view time instead of storing every detail up front.",
    spotItInTheWild: [
      "Ocean and terrain in modern games growing denser geometry near the camera",
      "Snow and sand that deform under footprints (tessellation plus displacement)",
      "Globe surfaces subdivided more finely near the horizon-to-camera zoom point in virtual globes",
    ],
    deeperDive:
      "In the hardware pipeline, two extra shader stages surround a fixed-function tessellator: the hull (control) shader decides per-patch tessellation factors — typically from screen-space edge length — and the domain (evaluation) shader positions each generated vertex, often sampling a displacement map. Crack-free results demand matching factors along shared edges. Mesh shaders are increasingly replacing this fixed scheme with a more flexible compute-like model, and the term also covers CPU-side meanings: subdivision surfaces (Catmull-Clark) in modeling, and triangulating polygons — like building footprints — into renderable meshes.",
    demos: ["displacement"],
    relatedTermIds: [
      "triangle-mesh",
      "displacement-mapping",
      "mesh-simplification",
      "terrain-rendering",
      "level-of-detail",
    ],
  },
  {
    id: "instancing",
    title: "Instancing",
    synonyms: ["geometry instancing", "instanced rendering"],
    category: "geometry-scene",
    difficulty: "intermediate",
    explanation:
      "Instancing draws many copies of the same mesh — a thousand trees, ten thousand windows — with a single command to the GPU. The mesh is stored once, and a compact list of per-copy differences (position, rotation, scale, color) tells the GPU where each instance goes. The GPU then stamps out all copies in one pass instead of being asked one thousand separate times.",
    whyItMatters:
      "Telling the GPU what to draw has a fixed cost per request — instancing turns ten thousand requests into one, which is often the difference between a slideshow and a smooth frame.",
    analogy:
      "A rubber stamp versus hand-drawing: carve the shape once, then stamp it across the page at different spots and angles. The alternative — redrawing it from scratch each time — is what makes un-instanced scenes slow.",
    spotItInTheWild: [
      "Forests, grass fields, and crowds in games — thousands of copies, a handful of unique meshes",
      "Thousands of identical 3D symbols (trees, signposts) across a SceneView drawn in one batch",
      "Particle systems, where every spark is an instance of the same tiny quad",
    ],
    deeperDive:
      "APIs expose it as a draw call with an instance count: the vertex shader runs per vertex per instance, reading per-instance attributes (typically a transform matrix and color) from a separate buffer or by indexing with the built-in instance ID. The win is on the CPU side — draw-call submission and state changes are the usual bottleneck in object-heavy scenes — while the GPU still shades every instance. Instancing requires identical geometry and material per batch, so engines group objects accordingly; GPU-driven variants go further, letting a compute shader cull and build the instance list without the CPU touching it.",
    relatedTermIds: [
      "draw-calls-batching",
      "triangle-mesh",
      "gpu-vs-cpu-rendering",
      "frustum-culling",
    ],
  },
];
