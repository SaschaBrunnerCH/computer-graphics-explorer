# Phase 2 — Shading & Light Playgrounds (10 demos)

Covers the remaining **Shading & Materials**, **Lighting**, and **Textures** terms.
Conventions for every demo (same as phase 1): one default-export component under
`src/playgrounds/{r3f|webgl|diagrams|arcgis}/`, built on `PlaygroundFrame` +
`controls.tsx`, one line in `registry.ts`, `demo:` key set on the term(s), live
caption, INITIAL + reset, StrictMode-safe, **no network fetches** (procedural
canvas textures, bundled `RoomEnvironment`), typecheck + lint clean, verified
with a SwiftShader-flagged headless Playwright screenshot pass.

| # | Demo key | Terms served | Renderer | Idea |
|---|----------|--------------|----------|------|
| 1 | `normal-mapping` | normal-mapping, bump-mapping | r3f | Sphere/plane with a **procedurally generated** normal map (bricks drawn on an offscreen canvas → height → normals). Toggles: none / bump (grayscale perturbation) / normal map; orbiting light slider. Money shot: lighting detail moves correctly but the **silhouette stays smooth** — caption calls it out. |
| 2 | `displacement` | displacement-mapping, tessellation | r3f | Same height map applied as real vertex displacement. Subdivision slider (4→256 segments = the tessellation lesson), displacement scale slider, wireframe toggle. Compare with demo 1: silhouette now actually changes. |
| 3 | `fresnel` | fresnel-effect | r3f | Custom `ShaderMaterial` sphere + flat "water" plane; reflectance grows toward grazing angles. Sliders: IOR/F0, "exaggerate" boost; toggle Fresnel off (constant reflectance) to show how fake it looks. Orbit low over the plane to feel the effect. |
| 4 | `brdf-explorer` | brdf | diagrams (canvas 2D) | Polar plot of a GGX-ish lobe: incoming light arrow, surface line, lobe shape recomputed from roughness + metalness sliders; drag the light angle. Caption: "a BRDF answers one question — of the light arriving from A, how much leaves toward B?" |
| 5 | `albedo` | albedo | r3f | Split sphere: left half renders **albedo only** (unlit base color), right half fully shaded. Color picker (calcite-input via a small wrapper or preset swatches), light intensity slider. Lesson: albedo is what's left when you remove all lighting. |
| 6 | `ibl` | image-based-lighting | r3f | Bundled `RoomEnvironment` PMREM as the only light source. Controls: env rotation slider, blur/roughness slider, IBL ↔ single-directional-light segmented control. Distinct from the PBR grid demo: here the environment is the star, on one glossy + one rough object. |
| 7 | `light-types` | light-types | r3f | One small scene (ground + pillars) lit by a segmented choice of directional / point / spot / area (RectAreaLight + bundled helper init). Per-type sliders: distance/decay (point), cone angle + penumbra (spot), size (area). Shadows on where supported. |
| 8 | `light-baking` | light-baking | r3f | Two prebaked lightmaps (drawn procedurally: soft blob shadows + color bleed) on a simple room, vs. live dynamic light. Switch "Baked / Dynamic"; in baked mode the light-position slider deliberately does nothing — the caption explains *why* (that's the trade-off). |
| 9 | `shader-lab` | shader | webgl | Minimal live GLSL editor: textarea + compile-on-change with the real `getShaderInfoLog` errors shown in a notice; preset gallery (color wave, vertex wobble, plasma). Uniforms wired: time, slider-driven float. The error-message experience *is* the lesson about how shaders are programs. |
| 10 | `uv-unwrap` | uv-coordinates, texture-atlas | diagrams + r3f | Side-by-side: 3D cube (r3f) and its 2D UV layout (canvas). Hovering a face highlights it in both views. "Atlas mode" packs four different face textures into one sheet and shows the UV islands pointing into it. |

## Term data updates

Set `demo:` on: normal-mapping + bump-mapping → `normal-mapping`; displacement-mapping +
tessellation → `displacement`; fresnel-effect → `fresnel`; brdf → `brdf-explorer`;
albedo → `albedo`; image-based-lighting → `ibl`; light-types → `light-types`;
light-baking → `light-baking`; shader → `shader-lab`; uv-coordinates + texture-atlas → `uv-unwrap`.

## Risks / notes

- RectAreaLight needs `RectAreaLightUniformsLib.init()` from three examples (bundled, fine).
- Shader-lab: debounce compiles (~300 ms); never let a broken user shader crash the page —
  keep last-good program bound and surface the error text instead.
- The two map-based demos (1, 2) should share one height-map generator helper
  (`src/playgrounds/r3f/lib/heightmap.ts` is acceptable as a first shared helper).
