import type { TermInput } from "../types";

export const lighting: TermInput[] = [
  {
    id: "direct-vs-indirect-lighting",
    title: "Direct vs Indirect Lighting",
    synonyms: ["direct illumination", "indirect illumination", "bounce lighting"],
    category: "lighting",
    difficulty: "intermediate",
    explanation:
      "Direct lighting is light that travels straight from a light source to a surface and then to your eye — the bright side of a building facing the sun. Indirect lighting is everything that arrives after bouncing off other surfaces first: the soft glow inside a room whose window faces away from the sun. Real scenes are always a mix of both, and the indirect part is what makes shadowed areas readable instead of pitch black.",
    whyItMatters:
      "Direct light is cheap to compute and indirect light is expensive, so this split decides what a renderer does for real and what it fakes.",
    analogy:
      "A flashlight in a dark room: the spot on the wall is direct light; the fact that you can faintly see the rest of the room at all is indirect light bouncing off that spot.",
    spotItInTheWild: [
      "The shadowed side of a 3D city model staying visible instead of black — that fill is faked or computed indirect light",
      "A red carpet 'bleeding' red onto a white wall next to it in a path-traced render",
      "Game settings labeled 'bounce lighting' or 'GI quality'",
    ],
    deeperDive:
      "Mathematically, the rendering equation splits incoming light at a point into emission, direct illumination (one segment from a light), and indirect illumination (light that has scattered at least once). Rasterizers evaluate direct light analytically per light per pixel, then approximate the indirect term with ambient constants, baked lightmaps, light probes, or screen-space tricks. Path tracers handle both terms uniformly by following bounces, which is why their soft, color-bleeding look is so hard to fake — the indirect term is recursive and touches the whole scene.",
    relatedTermIds: ["global-illumination", "path-tracing", "ambient-occlusion", "light-types"],
    demos: ["global-illumination"],
  },
  {
    id: "global-illumination",
    title: "Global Illumination",
    synonyms: ["GI", "indirect illumination"],
    category: "lighting",
    difficulty: "advanced",
    explanation:
      "Global illumination (GI) is the family of techniques that account for light bouncing between surfaces, not just light arriving straight from a lamp or the sun. With GI, a white ceiling brightens a room, a green wall tints nearby objects green, and shadows fill with soft ambient light. It is 'global' because the lighting at any point can depend on every other surface in the scene.",
    whyItMatters:
      "GI is the single biggest gap between 'computer graphics' and 'photograph' — it's why offline renders look real and why engines spend so much effort approximating it.",
    analogy:
      "Singing in a tiled bathroom versus an open field: the sound reaching your ears is mostly reflections off the walls. GI does the same accounting for light instead of sound.",
    spotItInTheWild: [
      "Color bleeding in Pixar films — a character's skin picking up green from grass they sit on",
      "Lumen in Unreal Engine 5 or 'RTX GI' settings in modern games",
      "Architectural renderings where sunlight through one window softly lights the whole room",
    ],
    deeperDive:
      "GI techniques are strategies for approximating the recursive rendering equation. Offline, path tracing converges to the true answer by averaging random light paths. Real-time engines use a zoo of approximations: baked lightmaps and irradiance probes (precomputed, static), voxel cone tracing and surfel-based GI (coarse dynamic), screen-space GI (cheap but limited to what's on screen), and hardware-ray-traced GI with denoising. Each trades accuracy, dynamism, and memory differently — which is why 'GI quality' sliders exist and why moving a wall in some games doesn't move its bounce light.",
    relatedTermIds: [
      "direct-vs-indirect-lighting",
      "path-tracing",
      "radiosity",
      "light-baking",
      "ambient-occlusion",
    ],
    demos: ["global-illumination"],
  },
  {
    id: "radiosity",
    title: "Radiosity",
    synonyms: [],
    category: "lighting",
    difficulty: "advanced",
    explanation:
      "Radiosity is a classic global illumination method that computes how diffuse (matte) surfaces exchange light with each other. The scene is divided into small patches, and the algorithm solves how much light each patch sends to every other patch until the energy balances out. The result is beautifully soft, view-independent lighting — but only for matte surfaces, since radiosity ignores mirrors and glossy reflections.",
    whyItMatters:
      "Radiosity powered the soft, bounce-lit look of late-90s games and architectural visualization, and its ideas live on in today's lightmap bakers.",
    analogy:
      "A group of people standing in a circle, each holding a dim lamp and a mirror-less white board: everyone's board gets a little brighter from everyone else's, round after round, until the brightness settles.",
    spotItInTheWild: [
      "Quake II's famously soft baked lighting — computed with radiosity",
      "Architectural walkthroughs where rooms feel evenly, naturally lit",
      "Lightmap bakers in engines, many of which descend directly from radiosity solvers",
    ],
    deeperDive:
      "Radiosity treats the scene as a system of linear equations: each patch's outgoing light equals its emission plus its reflectance times the light gathered from all other patches, weighted by 'form factors' (geometric visibility terms). Solving it — by matrix inversion or iterative 'shooting' of energy from the brightest patches — yields per-patch radiosity that holds for any camera position, making it ideal for precomputation. Its limits are structural: form factors only model perfectly diffuse exchange, the patch grid caps lighting detail, and the O(n²) patch relationships scale poorly, which is why path tracing eventually displaced it.",
    demos: ["radiosity"],
    relatedTermIds: [
      "global-illumination",
      "light-baking",
      "path-tracing",
      "direct-vs-indirect-lighting",
    ],
  },
  {
    id: "path-tracing",
    title: "Path Tracing",
    synonyms: ["Monte Carlo ray tracing"],
    category: "lighting",
    difficulty: "advanced",
    explanation:
      "Path tracing renders an image by following many random light paths per pixel: a ray leaves the camera, bounces off surfaces in randomized directions, and eventually reaches a light source. Each path is one rough guess at the pixel's true color; averaging thousands of guesses converges to a physically accurate image, complete with soft shadows, color bleeding, and realistic reflections. The catch is noise — too few samples and the image looks like grainy film.",
    whyItMatters:
      "Path tracing is the gold standard that film renderers use and that every real-time lighting trick is ultimately trying to imitate.",
    analogy:
      "Estimating the average depth of a lake by throwing in thousands of weighted strings at random spots: each measurement is crude, but the average gets ever closer to the truth.",
    spotItInTheWild: [
      "The grainy preview that 'cleans up' over seconds in Blender's Cycles renderer",
      "'Full ray tracing' or 'path traced' modes in games like Cyberpunk 2077",
      "Essentially every animated film and VFX shot rendered in the last decade",
    ],
    deeperDive:
      "Path tracing is Monte Carlo integration of the rendering equation: at each bounce, a direction is sampled from the surface's BRDF, and the path's contribution is weighted accordingly. Variance — visible as noise — is the central enemy, fought with importance sampling (favor directions where light likely comes from), next-event estimation (explicitly sample light sources at each bounce), Russian roulette path termination, and low-discrepancy sample sequences. Real-time path tracing leans on hardware BVH traversal plus aggressive AI denoisers and temporal accumulation to make 1–2 samples per pixel presentable.",
    demos: ["path-tracer"],
    relatedTermIds: ["ray-tracing", "global-illumination", "brdf", "radiosity"],
  },
  {
    id: "ambient-occlusion",
    title: "Ambient Occlusion (AO & SSAO)",
    synonyms: ["AO", "SSAO", "screen-space ambient occlusion"],
    category: "lighting",
    difficulty: "intermediate",
    explanation:
      "Ambient occlusion darkens the places where ambient light has trouble reaching: corners, crevices, and points where objects meet. It doesn't simulate any particular light — it estimates how 'blocked' each point is by nearby geometry and dims it accordingly. SSAO (screen-space ambient occlusion) is the cheap real-time version that computes this from the depth buffer of the current frame.",
    whyItMatters:
      "AO is one of the highest-impact-per-millisecond effects in real-time graphics — it grounds objects and reveals shape for a tiny fraction of the cost of true indirect lighting.",
    analogy:
      "Dust and shade gather in the corners of a room and under furniture — exactly the spots open light can't easily reach. AO paints that intuition directly into the image.",
    spotItInTheWild: [
      "Subtle darkening in building crevices and where structures meet the ground in an ArcGIS SceneView",
      "The 'SSAO' or 'ambient occlusion' toggle in nearly every game's graphics settings",
      "Objects looking like they 'float' when AO is switched off",
    ],
    deeperDive:
      "True AO at a point integrates visibility over the hemisphere above it — what fraction of ambient light is blocked within some radius. SSAO approximates this per pixel using only screen-space data: sample points are scattered in a hemisphere oriented by the surface normal, projected back into the depth buffer, and counted as occluded if the stored depth is closer. Variants (HBAO, GTAO) improve the estimate with horizon angles and better falloff. The screen-space limitation is fundamental: geometry off-screen or hidden behind closer surfaces can't occlude, causing halos and AO that fades at screen edges — artifacts you can hunt for in the playground.",
    relatedTermIds: [
      "global-illumination",
      "direct-vs-indirect-lighting",
      "depth-buffer",
      "normal-vectors",
    ],
    demos: ["ssao"],
  },
  {
    id: "light-types",
    title: "Light Types (Directional / Point / Spot / Area)",
    synonyms: ["directional light", "point light", "spot light", "area light"],
    category: "lighting",
    difficulty: "basics",
    explanation:
      "Engines describe light sources with a few idealized types. A directional light shines parallel rays from infinitely far away — perfect for the sun. A point light radiates in all directions from a single spot, like a bare bulb. A spot light is a point light restricted to a cone, like a flashlight. Area lights emit from a surface, like a softbox or a window, and produce naturally soft shadows.",
    whyItMatters:
      "Picking the right light type is the first decision in lighting any scene, and each type has a very different performance and shadow cost.",
    analogy:
      "A lighting shop: the sun lamp (directional), the bare bulb (point), the flashlight (spot), and the photographer's softbox (area) — same electricity, very different shadows and moods.",
    spotItInTheWild: [
      "The daylight widget in an ArcGIS SceneView moving one directional 'sun' across a whole city",
      "Street lamps in open-world games — point or spot lights with a limited radius",
      "A stage spotlight cone made visible by fog in a concert scene",
    ],
    deeperDive:
      "The types differ in how direction and attenuation are computed per shaded point. Directional lights have constant direction and no falloff; point lights attenuate with distance (physically by inverse square, often artistically clamped) and need six-faced cube shadow maps; spot lights add an angular falloff between inner and outer cone angles and shadow-map cheaply from a single frustum. Area lights are the physically honest ones — real sources have size — but require integrating over the emitter, so real-time engines use approximations like linearly transformed cosines. Light count matters too: forward renderers pay per light per pixel, which pushed engines toward clustered and deferred lighting.",
    demos: ["light-types", "shadows"],
    relatedTermIds: [
      "shadow-mapping",
      "soft-vs-hard-shadows",
      "shading-models",
      "specular-vs-diffuse",
    ],
  },
  {
    id: "image-based-lighting",
    title: "Image-Based Lighting (IBL)",
    synonyms: ["IBL", "environment lighting", "environment map lighting"],
    category: "lighting",
    difficulty: "advanced",
    explanation:
      "Image-based lighting uses a panoramic image of an environment — sky, buildings, room interior — as the light source itself. Instead of a handful of discrete lamps, every pixel of the environment image contributes light from its direction. This is how a 3D object can be lit so it looks like it truly belongs in a photographed location.",
    whyItMatters:
      "IBL is the backbone of PBR workflows — it supplies the rich, directionful ambient light that makes metals and glossy materials look real.",
    analogy:
      "Wrapping the scene in a giant glowing photo printed on the inside of a sphere: every object is lit by whatever part of the photo it 'sees' in each direction.",
    spotItInTheWild: [
      "Movie VFX crews photographing chrome balls on set to capture lighting for digital characters",
      "Car configurators where the paint convincingly reflects a showroom or sky",
      "Realistic ambient light and reflections on glossy 3D objects in web scenes, including 3D maps",
    ],
    deeperDive:
      "IBL evaluates the rendering equation with the environment map as the incoming radiance. Doing that integral per pixel is too slow, so engines precompute it: the diffuse term becomes an irradiance map (the environment convolved with a cosine lobe), and the specular term is pre-filtered into mipmap levels of increasing roughness, combined at runtime with a BRDF lookup table — the 'split-sum' approximation popularized by Unreal. Source images are HDR (the sun must be thousands of times brighter than the sky for correct results), and local light probes blend multiple captured environments so reflections roughly match an object's position indoors.",
    demos: ["ibl"],
    relatedTermIds: ["pbr", "hdr", "specular-vs-diffuse", "fresnel-effect", "global-illumination"],
  },
  {
    id: "light-baking",
    title: "Light Baking & Lightmaps",
    synonyms: ["lightmaps", "baked lighting", "precomputed lighting"],
    category: "lighting",
    difficulty: "intermediate",
    explanation:
      "Light baking computes expensive lighting — bounces, soft shadows, ambient occlusion — once, ahead of time, and stores the result in textures called lightmaps. At runtime the engine just reads the texture instead of redoing the math, so even a phone can display lighting that took minutes or hours to calculate. The trade-off: baked lighting is frozen, so it only works for things that don't move.",
    whyItMatters:
      "Baking is how games and visualizations get film-quality global illumination within a real-time budget — it trades flexibility for nearly free beauty.",
    analogy:
      "Meal prepping for the week: you do all the slow cooking on Sunday (the bake), and each weekday dinner is just reheating (the runtime lookup). Delicious and fast — as long as nobody changes the menu.",
    spotItInTheWild: [
      "Gorgeous, soft lighting in a game level — until you notice your character casts no shadow on it",
      "A lamp you can shoot out in a game whose glow on the walls stays put (it's baked in)",
      "'Baking' progress bars in Unity, Unreal, or Blender taking minutes to hours",
    ],
    deeperDive:
      "A baker path-traces or radiosity-solves the static scene and writes incoming light into a dedicated, non-overlapping UV layout (a second UV channel) per object. Variants store different things: full lightmaps (all light, fully static), indirect-only lightmaps (combined with real-time direct light and shadows), directional lightmaps that preserve a dominant light direction so normal maps still respond, and light probes — points sampling the baked light field so dynamic objects moving through the scene pick up plausible lighting. Classic failure modes are seams at UV chart boundaries, light leaks from too-low lightmap resolution, and the visible mismatch between crisp dynamic objects and soft baked surroundings.",
    demos: ["light-baking"],
    relatedTermIds: [
      "global-illumination",
      "radiosity",
      "uv-coordinates",
      "texture-mapping",
      "shadow-mapping",
    ],
  },
  {
    id: "shadow-mapping",
    title: "Shadows & Shadow Mapping",
    synonyms: ["shadow maps", "depth map shadows"],
    category: "lighting",
    difficulty: "intermediate",
    explanation:
      "Rasterization has no built-in idea of shadows, so engines use a trick: first render the scene from the light's point of view, keeping only depth — a 'shadow map' recording how far the light can see in each direction. Then, while rendering the normal view, each pixel checks: am I farther from the light than what the light recorded? If yes, something stands between me and the light, so I'm in shadow.",
    whyItMatters:
      "Shadow mapping is how virtually every real-time engine — games, browsers, 3D maps — draws shadows, and its quirks explain most shadow artifacts you'll ever see.",
    analogy:
      "Standing where the lamp is and photographing the room: anything visible in your photo is lit; anything hidden behind something in the photo is in shadow. The shadow map is that photo, storing distances instead of colors.",
    spotItInTheWild: [
      "Building shadows sweeping across a city as the ArcGIS daylight widget moves the sun",
      "Shadow edges turning blocky or shimmering in the distance in games — shadow map resolution running out",
      "Self-shadowing stripes ('shadow acne') on surfaces in poorly tuned scenes",
    ],
    deeperDive:
      "The technique inherits all the limits of a depth texture. Limited resolution and depth precision cause shadow acne — surfaces incorrectly self-shadowing in stripe patterns — which is countered with a depth bias (plus slope-scaled bias for grazing angles); too much bias detaches shadows from their casters, the 'peter-panning' artifact. A single map can't cover a large scene at useful resolution, so cascaded shadow maps (CSM) split the view frustum into distance bands, each with its own map — near cascades get fine detail, far ones get coverage — with visible quality steps at cascade boundaries. Filtering (PCF, VSM) softens the hard binary test into smoother penumbra-like edges. Experiment with bias and resolution in the playground to produce acne and peter-panning on demand.",
    relatedTermIds: ["depth-buffer", "soft-vs-hard-shadows", "light-types", "frame-buffer"],
    demos: ["shadows"],
  },
  {
    id: "soft-vs-hard-shadows",
    title: "Soft vs Hard Shadows",
    synonyms: ["penumbra", "soft shadows", "hard shadows"],
    category: "lighting",
    difficulty: "intermediate",
    explanation:
      "A hard shadow has a knife-sharp edge; a soft shadow fades gradually from dark to lit through a fuzzy border called the penumbra. The difference comes from the size of the light source: a tiny or very distant light (a clear-sky sun) casts hard shadows, while a large or close source (an overcast sky, a softbox) casts soft ones. Real shadows also sharpen near the caster and soften with distance — a flagpole's shadow is crisp at its base and blurry at its tip.",
    whyItMatters:
      "Shadow softness is a strong realism cue — uniformly razor-sharp shadows are one of the fastest ways for an eye to flag an image as computer-generated.",
    analogy:
      "Hold your hand near a wall under a lamp: a sharp silhouette. Move it away from the wall and the shadow grows blurry — the lamp's size lets light sneak partway around your hand at the edges.",
    spotItInTheWild: [
      "Crisp noon shadows vs barely-there soft shadows on an overcast day — outside your window or in a 3D city scene as sun settings change",
      "Game settings offering 'PCSS' or 'contact-hardening shadows'",
      "Studio portrait photography using softboxes precisely to avoid harsh shadow edges",
    ],
    deeperDive:
      "Physically, the penumbra is the region where the light source is only partially blocked, and its width grows with light size and caster-to-receiver distance. Plain shadow mapping yields hard edges because the depth test is binary, so engines fake softness: percentage-closer filtering (PCF) averages several shadow-map tests for a uniform blur, while percentage-closer soft shadows (PCSS) first estimates average blocker distance per pixel to scale the filter radius — approximating true contact-hardening behavior at real cost. Ray-traced shadows get it right by shooting multiple rays toward points across the light's actual area, with denoising to tame the resulting noise.",
    relatedTermIds: ["shadow-mapping", "light-types", "ambient-occlusion", "ray-tracing"],
    demos: ["shadows"],
  },
];
