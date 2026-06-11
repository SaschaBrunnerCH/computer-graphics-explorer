# Phase 3 — Rays & Post-Processing Playgrounds (11 demos)

Covers the remaining **Rendering Fundamentals** ray/timing terms and the whole
**Post-Processing & Effects** category. Same conventions and **ArcGIS-everywhere
policy** as phase 2 (see `phase-2-shading-and-light.md` header). Post-processing
demos may use the EffectComposer passes that **ship inside three**
(`three/examples/jsm/postprocessing/*`) — no new dependencies.

Note on ArcGIS coverage in this phase: the post-processing operators (bloom, DoF,
tone mapping, motion blur, gamma) expose no runtime controls in the SDK, so per the
honest-controls rule they stay r3f/canvas-only. The ray family gets a real-world
ArcGIS companion (#11).

| # | Demo key | Terms served | Renderer | Idea |
|---|----------|--------------|----------|------|
| 1 | `ray-lab` | ray-casting, ray-tracing | diagrams (canvas 2D) | Top-down 2D scene (walls, a mirror, a glass block). Mode A "cast": one ray per screen column, first hit only — Wolfenstein style. Mode B "trace": rays recurse off the mirror/through glass; bounce-depth slider 0–5. Drag the camera; watch ray fans live. |
| 2 | `path-tracer` | path-tracing | diagrams (canvas 2D) | Tiny progressive 2D path tracer (one emissive patch, two diffuse walls) accumulating samples in real time. Samples-per-pixel counter, noise visibly converging; pause/reset; "rays per frame" slider. The noise → clean convergence IS the lesson. |
| 3 | `radiosity` | radiosity | diagrams (canvas 2D) | A 2D room subdivided into patches; iterate light bounces step-by-step (button + auto-play): watch energy spread patch to patch, color bleeding emerge. Patch-size slider shows the resolution trade-off. |
| 4 | `tone-mapping` | tone-mapping, hdr | r3f | Scene with true HDR range (emissive sun + dim interior). Segmented operator: None / Reinhard / ACES (renderer.toneMapping), exposure slider. Caption explains clipping vs. rolloff; "show clipped pixels" toggle paints blown pixels magenta via a tiny post pass. |
| 5 | `bloom` | bloom | r3f | UnrealBloomPass on emissive neon shapes: threshold / strength / radius sliders. Threshold slider is the teaching control — drop it and the whole scene glows (the classic mistake). |
| 6 | `depth-of-field` | depth-of-field | r3f | BokehPass: focus-distance slider (with markers at three object rows), aperture slider. Click-to-focus on the stage is the delight feature (raycast → set focus). |
| 7 | `motion-blur` | motion-blur | diagrams (canvas 2D) | A ball orbiting at constant speed, rendered with N sub-frame samples per displayed frame (shutter-angle slider 0–360°, sample-count slider). Honest CPU accumulation — shows why blur = integration over the shutter window, and the strobing artifact at low samples. |
| 8 | `gamma` | gamma-correction, color-spaces | diagrams (canvas 2D) | Three-part panel: (a) linear vs sRGB-encoded gradient ramps, (b) the classic 50%-gray checkerboard comparison, (c) blend-two-colors in linear vs in sRGB (the red+green = muddy brown bug). Gamma slider + "blend in linear" toggle. |
| 9 | `ssr` | screen-space-reflections | r3f | Glossy floor with drei `MeshReflectorMaterial` + objects that can slide off-screen (position slider). The lesson is the **failure mode**: as an object leaves the frame its reflection dies — caption explains that screen-space techniques only know what the screen knows. |
| 10 | `frame-time` | frame-rate, double-buffering | diagrams (canvas 2D) | Frame-budget simulator: artificial work-per-frame slider, live frame-time graph (last 120 frames), fps readout, percentile marker. "Simulate vsync" toggle snaps presentation to 60 Hz multiples; a drawn tear-line illustration for vsync-off; triple-buffering note in caption. |
| 11 | `scene-picking` | ray-casting (companion to #1) | **arcgis** | Real-world ray casting: click anywhere in a Zurich buildings scene → `view.hitTest`, highlight the hit feature, and draw the camera→hit ray as a 3D line graphic with distance readout in the caption. Toggle "show ray". Picking *is* ray casting — same machinery the term page describes. Keyless OSM buildings layer (already verified). |

## Term data updates

Append to `demos: []`: ray-casting → `ray-lab` **and** `scene-picking`; ray-tracing →
`ray-lab`; path-tracing → `path-tracer`; radiosity → `radiosity`; tone-mapping +
hdr → `tone-mapping`; bloom → `bloom`; depth-of-field → `depth-of-field`;
motion-blur → `motion-blur`; gamma-correction + color-spaces → `gamma`;
screen-space-reflections → `ssr`; frame-rate + double-buffering → `frame-time`.

`rendering` and `frame-buffer` stay demo-less for now (the tour + cross-links carry
them); candidates for a phase-4 stretch goal.

## Risks / notes

- EffectComposer passes must be disposed on unmount and rebuilt on canvas resize;
  wrap once in a small shared `usePostPass` helper if it gets repetitive.
- BokehPass/UnrealBloomPass under SwiftShader CI can be slow — smoke tests assert
  canvas + no page errors only (existing policy), don't wait for convergence.
- Path tracer + radiosity: keep worlds tiny (≤64×64 patch/pixel grids), budget the
  per-frame work so low-end devices stay responsive; respect `prefers-reduced-motion`
  by starting paused.
- MeshReflectorMaterial is planar reflection, not literal SSR — the caption must say
  "stand-in that shares SSR's defining limitation" (honesty rule from DECISIONS.md).
