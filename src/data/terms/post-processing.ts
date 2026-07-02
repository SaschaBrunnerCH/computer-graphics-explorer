import type { TermInput } from "../types";

export const postProcessing: TermInput[] = [
  {
    id: "tone-mapping",
    title: "Tone Mapping",
    synonyms: [],
    category: "post-processing",
    difficulty: "intermediate",
    explanation:
      "A rendered scene can contain brightness values far beyond what a monitor can show — sunlight is thousands of times brighter than a shaded wall. Tone mapping is the step that compresses that huge range of brightness into the limited range a screen can display, while keeping the image looking natural. Done well, bright areas stay detailed instead of blowing out to pure white, and shadows keep their depth.",
    whyItMatters:
      "It's the final translation between physically realistic lighting math and the picture your monitor can actually show — get it wrong and every scene looks washed out or murky.",
    analogy:
      "A photographer developing film from a high-contrast scene: the negative captured both the bright sky and the dark doorway, and careful printing in the darkroom squeezes both onto paper that can only show so much contrast.",
    spotItInTheWild: [
      "Games where stepping out of a dark cave into sunlight looks bright but not blinding",
      "The 'filmic' or 'ACES' look options in game graphics settings",
      "Phone cameras compressing a sunset so both the sky and your friend's face are visible",
    ],
    deeperDive:
      "Tone mapping operators map HDR radiance to display range. The simplest, Reinhard (`c / (1 + c)`), compresses gently but desaturates highlights. Filmic curves like Hable/Uncharted 2 and ACES add a toe and shoulder that mimic film response: shadows roll off gently, highlights saturate toward white gracefully. The operator runs per pixel at the end of the HDR pipeline, before (or combined with) gamma encoding. Local operators that adapt per region exist but are rare in real time; games mostly use a global curve plus auto-exposure, which scales scene brightness based on a running average luminance — the source of the 'eye adaptation' effect when moving between dark and bright areas.",
    demos: ["tone-mapping", "imagery-tone"],
    relatedTermIds: ["hdr", "gamma-correction", "color-spaces", "bloom"],
  },
  {
    id: "hdr",
    title: "High Dynamic Range (HDR)",
    synonyms: ["HDR rendering", "high dynamic range"],
    category: "post-processing",
    difficulty: "intermediate",
    explanation:
      "Dynamic range is the gap between the darkest and brightest values in a scene. HDR rendering computes lighting with values that can go far beyond 'maximum white' — the sun can be a million times brighter than a shadow, and the math keeps track of that. Only at the very end is the result squeezed down (via tone mapping) to something a display can show.",
    whyItMatters:
      "Realistic lighting is impossible if everything brighter than 'white' is clipped away mid-calculation — HDR is what lets reflections, bloom, and exposure behave like they do in the real world.",
    analogy:
      "Doing your accounting in full dollars and cents and only rounding at the final invoice, instead of rounding every intermediate step — round too early and the errors pile up where you can never get them back.",
    spotItInTheWild: [
      "'HDR' badges on TVs and monitors, which can display some of that extra range directly",
      "A game scene where a bright window seen from indoors still shows the sky instead of pure white",
      "Phone cameras merging several exposures into one balanced photo",
    ],
    deeperDive:
      "HDR rendering means lighting is accumulated into floating-point render targets (commonly `RGBA16F`) instead of 8-bit-per-channel buffers, so values above 1.0 survive. This enables physically plausible light intensities, meaningful auto-exposure, and effects that depend on knowing how over-bright a pixel is — bloom thresholds, lens flares, sun glints. Image-based lighting uses HDR environment maps for the same reason: an 8-bit sky photo can't tell the renderer the sun is 50,000 times brighter than the clouds. HDR displays add a second meaning of the term: instead of tone mapping all the way down to standard range, the engine outputs to a wide-range format (e.g. HDR10) and lets the display show real highlight intensity.",
    demos: ["tone-mapping", "imagery-tone"],
    relatedTermIds: ["tone-mapping", "bloom", "image-based-lighting", "frame-buffer"],
  },
  {
    id: "bloom",
    title: "Bloom",
    synonyms: ["glow", "light bloom"],
    category: "post-processing",
    difficulty: "intermediate",
    explanation:
      "Bloom is the soft halo of light that appears to bleed outward from very bright things — a sun glint on water, neon signs, headlights. Real camera lenses and even our eyes scatter a little light around intense sources, and bloom recreates that by blurring the brightest parts of the rendered image and adding the blur back on top.",
    whyItMatters:
      "It's the visual cue that tells your brain 'this is genuinely bright, not just white' — without it, a rendered sun looks like a flat white circle.",
    analogy:
      "Looking at a streetlight at night with slightly fogged glasses: the lamp itself is small, but a soft glow spreads around it because light scatters before reaching your eye.",
    spotItInTheWild: [
      "The glow around the sun and its reflection on water in a 3D map or game",
      "Neon signs and sci-fi UI screens that visibly radiate light",
      "Movie night scenes where every car headlight wears a soft halo",
    ],
    deeperDive:
      "The standard implementation extracts pixels above a brightness threshold from the HDR frame, then blurs them — typically by repeatedly downsampling the bright-pass image into a mip chain, blurring at each level, and upsampling additively. Blurring at multiple resolutions is the trick: small Gaussian kernels on low-res buffers are cheap but composite into a glow that spreads hundreds of pixels wide. The result is added back to the scene before tone mapping. This is also why bloom genuinely needs HDR input: with 8-bit color, a white piece of paper and a light bulb both clip to 1.0, so both would glow equally — the threshold has nothing to grab onto.",
    demos: ["bloom", "map-bloom"],
    relatedTermIds: ["hdr", "tone-mapping", "frame-buffer"],
  },
  {
    id: "depth-of-field",
    title: "Depth of Field",
    synonyms: ["DoF", "bokeh"],
    category: "post-processing",
    difficulty: "intermediate",
    explanation:
      "Depth of field blurs the parts of the image that are nearer or farther than the distance the camera is focused on, just like a real lens does. A virtual pinhole camera renders everything perfectly sharp; depth of field deliberately gives that up to mimic real optics. The soft, often disc-shaped highlights in the blurred regions are called bokeh.",
    whyItMatters:
      "It's one of cinematography's strongest tools for directing attention — blur the background and the viewer's eye goes exactly where you want it.",
    analogy:
      "A portrait photographer opening the lens aperture wide: the subject's face is razor sharp while the street behind dissolves into soft colored discs.",
    spotItInTheWild: [
      "Cutscenes where the background melts away behind a character's face",
      "Portrait mode on phones, which fakes the same effect from depth data",
      "Tilt-shift photos where a real city looks like a miniature model",
    ],
    deeperDive:
      "Real lenses focus each point of the scene to a point only at the focal distance; elsewhere it spreads into a 'circle of confusion' (CoC) whose radius grows with distance from the focal plane and with aperture size. Post-process DoF reads the depth buffer, computes a CoC per pixel, and applies a variable-radius blur — often a 'scatter-as-gather' pass that samples in a disc pattern shaped like the lens aperture, which is what makes bokeh hexagonal or circular. The hard problems are at the edges: a sharp foreground object should blur and bleed over the in-focus background behind it, but a screen-space blur only has one depth per pixel, so engines render near-field blur in a separate layer to fake that partial occlusion.",
    demos: ["depth-of-field"],
    relatedTermIds: ["depth-buffer", "camera-frustum", "motion-blur"],
  },
  {
    id: "motion-blur",
    title: "Motion Blur",
    synonyms: [],
    category: "post-processing",
    difficulty: "intermediate",
    explanation:
      "A real camera's shutter stays open for a moment, so anything moving smears slightly across the photo. Motion blur recreates that smear in rendered images, which otherwise freeze every frame perfectly sharp. The result is motion that reads as fast and fluid instead of strobing from one frozen pose to the next.",
    whyItMatters:
      "It makes 24-frames-per-second films watchable and games feel faster — and racing games would feel half as quick without it.",
    analogy:
      "Waving your hand in front of your face: you don't see five crisp hands, you see one smeared streak — your eyes have 'shutter time' too.",
    spotItInTheWild: [
      "Streaked wheels and scenery in racing games at top speed",
      "The blurred propeller in any movie shot of a plane",
      "The 'motion blur: on/off' toggle in nearly every game settings menu",
    ],
    deeperDive:
      "Offline renderers solve it honestly: distribute ray samples in time across the shutter interval, so moving geometry genuinely smears. Real-time engines instead render a velocity buffer — each pixel stores how far its surface moved on screen since the previous frame, computed by transforming each vertex by both this frame's and last frame's matrices. A post-process pass then blurs each pixel along its velocity vector. Camera-only motion blur is even cheaper, reconstructing velocity purely from the depth buffer and camera delta. Artifacts come from the screen-space shortcut: backgrounds bleed into fast-moving foreground objects and vice versa, which tile-based dilation of dominant velocities tries to hide.",
    demos: ["motion-blur"],
    relatedTermIds: ["depth-of-field", "frame-rate", "depth-buffer"],
  },
  {
    id: "screen-space-reflections",
    title: "Screen-Space Reflections (SSR)",
    synonyms: ["SSR"],
    category: "post-processing",
    difficulty: "advanced",
    explanation:
      "Screen-space reflections create mirror-like reflections — on wet streets, polished floors, water — using only information already in the rendered frame. For each reflective pixel, the technique marches a ray through the depth buffer to find which other on-screen pixel the reflection would show. It's far cheaper than ray tracing the actual scene, with one famous catch: it can only reflect what's currently visible on screen.",
    whyItMatters:
      "It's how games and 3D engines afford convincing wet-floor and water reflections within a real-time budget — and why those reflections vanish when you tilt the camera.",
    analogy:
      "Painting the reflection in a puddle by only looking at the finished painting itself: you copy the building you already painted above the puddle, flipped — but if the building isn't in the painting, you have nothing to copy.",
    spotItInTheWild: [
      "Wet asphalt mirroring neon signs in a rainy city game — until you look down and the reflections fade",
      "Water reflecting shoreline buildings in a 3D scene or map",
      "Reflections of off-screen objects popping out at the screen's edge",
    ],
    deeperDive:
      "For each pixel, SSR reconstructs the view-space position and normal, computes the reflection vector, then ray-marches it in screen space, comparing the ray's depth against the depth buffer at each step until it dips behind a surface — a hit means 'sample the color buffer there.' Practical implementations march in fewer, coarser steps with a binary-search refinement at the crossing, or use hierarchical depth (depth mip pyramids) to skip empty space. Rough surfaces jitter the reflection ray per the material's roughness and blur the result, usually leaning on temporal accumulation to hide the noise. Failure cases are structural: anything off-screen, behind the camera, or occluded in the depth buffer simply can't be reflected, so engines fall back to environment maps or ray tracing where SSR misses.",
    demos: ["ssr", "water-ssr"],
    relatedTermIds: ["depth-buffer", "frame-buffer", "ray-tracing", "image-based-lighting", "pbr"],
  },
  {
    id: "gamma-correction",
    title: "Gamma Correction",
    synonyms: ["gamma encoding"],
    category: "post-processing",
    difficulty: "intermediate",
    explanation:
      "Human eyes are much better at telling dark shades apart than bright ones. Gamma correction exploits this: instead of storing brightness linearly, images store a curved version that spends more of their limited precision on dark tones. Displays then apply the reverse curve, so the picture looks right — but it means the numbers in a typical image are not actual light intensities.",
    whyItMatters:
      "Half of all 'why does my lighting look wrong?' bugs in graphics come down to doing math on gamma-encoded values as if they were real light.",
    analogy:
      "A volume knob that's deliberately non-linear: the first quarter turn covers whisper to conversation, because that's where your ears notice every step — equal knob movement, not equal loudness.",
    spotItInTheWild: [
      "A 'gamma' or 'brightness calibration' slider when a game first launches",
      "Textures looking washed-out or chalky in a renderer with broken gamma handling",
      "The 2.2 figure that appears in every monitor calibration guide",
    ],
    deeperDive:
      "The pitfall is doing lighting math in the encoded space. Gamma encoding stores roughly `c^(1/2.2)`; the display applies `c^2.2` to undo it. But light is additive only in linear space: 50% gray in sRGB encoding represents about 21.4% physical light intensity (`0.5^2.2`), not 50%. Average two gamma-encoded values, or multiply a gamma-encoded texture by a light intensity, and the result is simply wrong — typically too-dark midtones, harsh shadow falloff, and ugly hue shifts in gradients. The correct workflow: decode inputs to linear (sample sRGB textures through hardware sRGB formats), do all lighting and blending in linear, and re-encode to gamma once, at the very end after tone mapping. Even image resizing suffers: downscaling in gamma space visibly darkens fine bright detail.",
    demos: ["gamma", "imagery-tone"],
    relatedTermIds: ["color-spaces", "tone-mapping", "texture-mapping"],
  },
  {
    id: "color-spaces",
    title: "Color Spaces (sRGB / Linear)",
    synonyms: ["sRGB", "linear workflow", "linear color"],
    category: "post-processing",
    difficulty: "intermediate",
    explanation:
      "A color space is the agreement about what the numbers in an image actually mean. sRGB — the default for photos, web colors, and most textures — stores gamma-curved values tuned for display and storage. Linear space stores actual light proportions, where doubling the number doubles the light. Renderers must convert sRGB inputs to linear before doing lighting math, then convert back for display; this discipline is called the linear workflow.",
    whyItMatters:
      "Mixing up the two spaces is the most common source of subtly wrong rendering — every engine, including 3D web mapping stacks, has to get this conversion right at every texture and every output.",
    analogy:
      "Currencies: dollars and euros are both 'money', but you can't add an amount in one to an amount in the other and get anything meaningful — convert everything to one currency, do the math, convert back at the end.",
    spotItInTheWild: [
      "A texture imported with the wrong color space flag looking washed out or too dark",
      "'sRGB' checkboxes on texture import settings in Unity, Unreal, or Blender",
      "CSS colors and PNG files — both defined in sRGB without most people ever noticing",
    ],
    deeperDive:
      "The core math trap: sRGB's transfer function (approximately `c^2.2`, exactly a piecewise curve with a linear toe) means stored values are not proportional to light. `0.5 + 0.5` in sRGB is not 'twice the light' — decoded, it's roughly `0.214 + 0.214 = 0.428` of linear light, while sRGB-space addition would claim full white. Any operation that assumes additivity — lighting, alpha blending, mipmap averaging, antialiasing resolve — must therefore happen in linear space. GPUs help: textures created with sRGB formats decode to linear automatically on sampling, and sRGB render targets re-encode on write, both with correct filtering. Color textures (albedo) are sRGB; data textures (normal maps, roughness, height) are already linear and must not be decoded. Wide-gamut spaces (Display P3, Rec.2020) extend the same idea with different primaries, raising the same convert-first rule.",
    demos: ["gamma"],
    relatedTermIds: ["gamma-correction", "tone-mapping", "albedo", "mipmapping", "anti-aliasing"],
  },
];
