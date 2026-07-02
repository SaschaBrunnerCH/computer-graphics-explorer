# Phase 9 — The RenderNode Frontier (3 demos + 1 stretch mode)

The second re-audit of 2026-07-02 established that `RenderNode` is not just
post-processing: the official
[windmills sample](https://developers.arcgis.com/javascript/latest/sample-code/custom-render-node-windmills/)
injects **custom geometry with custom shaders** into the scene (depth-tested
against the real city, ECEF render coordinates via `toRenderCoordinates()`),
`RenderNode.sunLight` exposes the **engine's actual incident light**
(direction + ambient/diffuse color), and retained FBOs accumulate across
frames (crossfade sample). On that foundation, five terms rejected as
impossible become buildable. These are the **hardest demos in the catalog** —
raw WebGL2 inside the engine's context, 32-bit local-origin precision,
depth-linearization math. Same conventions as phases 2–8 (PlaygroundFrame +
shared controls, registry + `arcgisPlaygrounds` + `demos: []` wiring,
honest-controls policy, StrictMode-safe, keyless only, live SwiftShader
verification; `scene-shader` is the shipped in-repo reference for node
lifecycle, `createSubclass` — decorators don't parse under Vite — and the
pass-through-on-failure pattern).

**Sequencing: build in table order.** #1 (`scene-material-lab`) teaches the
geometry-injection craft on the simplest case; #2 reuses its compositing math
for fullscreen ray-primitive intersection; #3 adds the accumulation layer on
top of #2's tracer. Each demo degrades to not-shipping rather than faking.

| # | Demo key | Companion to | Idea & honest lever |
|---|----------|--------------|---------------------|
| 1 | `scene-material-lab` | shading-models, brdf | A sphere of OUR geometry (windmills pattern: VBO in render coordinates around a local origin over a plaza, drawn into `opaque-color` via `bindRenderTarget()` with depth test on) shaded by OUR shaders, lit by `this.sunLight` — the same sun shading the city around it. Levers: SegmentedControl **Flat / Gouraud / Phong / PBR (GGX)** — four real shader implementations, the full historical spectrum the SDK itself doesn't expose — plus **roughness/metallic sliders** in the GGX mode with the analytic BRDF formula shown in the caption. Sweep the scene's daylight slider and the highlight moves identically on our sphere and on the city: proof it's one sun. Serves both terms with one injected object. |
| 2 | `hybrid-ray` | ray-tracing | A fullscreen `RenderNode` pass on `composite-color`: a **fragment-shader ray tracer** over 3–4 analytic spheres (one mirror, one glass-tinted, one matte) floating above the city — real primary rays, real shadow rays between the spheres, real mirror bounces (2–3 deep). Composited against the scene's **actual depth buffer** (linearized with `camera.near/far`, DoF-sample math) so the city occludes the spheres correctly, and the mirror sphere reflects the composite-color texture where rays exit the analytic set (labeled honestly as the screen-space fallback — the exact hybrid games ship). Levers: bounce-count slider (0 = silhouettes, 1 = reflections appear, 3 = inter-reflections), shadow-ray toggle. Caption: "the city is rasterized, the spheres are ray-traced — find the seam." |
| 3 | `scene-path-trace` | path-tracing, global-illumination | #2's analytic scene, traced stochastically: one random path per pixel per frame (cosine-weighted bounces, an emissive quad as the light), **accumulated in a retained FBO** and averaged — watch variance shrink as samples/pixel climbs (live SPP counter in the caption). The killer honest lever: any camera move **resets accumulation** — drag the map and it's noise, hold still and GI emerges: color bleeding from a red wall panel onto the white sphere (that's global-illumination, converging before your eyes). Levers: pause accumulation, bounce-count slider, "show single sample" toggle (the raw noisy estimate). Exactly why Blender/Cycles previews are noisy — now over a real city. |
| S | IBL mode in #1 (stretch) | image-based-lighting | A fourth material mode: the GGX sphere lit by a **procedural sky environment** whose sun position matches `sunLight` — split-sum-approximation sampling with a roughness-driven blur. Honest caption: the environment is synthetic (sun-matched), not a captured HDR — the r3f IBL demo has the real prefiltered environment; this shows the *lighting model* difference (analytic sun vs environment integral) under one real sun. Ship only if #1 lands cleanly with headroom. |

## Term data updates (all appends)

shading-models + brdf → `scene-material-lab`; ray-tracing → `hybrid-ray`;
path-tracing + global-illumination → `scene-path-trace`; image-based-lighting
→ `scene-material-lab` if the stretch mode lands. All keys also go into
`arcgisPlaygrounds`.

## Coverage after phase 9

**59 of 66** terms with an ArcGIS companion (60 with the IBL stretch). The
final 6 (rendering, radiosity, scene-graph, double-buffering,
gpu-vs-cpu-rendering, webgl-vs-webgpu) stay in the
[coverage report](../arcgis-companion-coverage.md)'s not-possible table —
watch item: Esri's WebGPU port.

## Risks / notes

- **Precision (#1)**: ECEF coordinates exceed float32 — follow the windmills
  sample's local-origin technique exactly (origin as Float32Array, view matrix
  pre-translated). Jitter at close zoom = wrong origin math.
- **Depth compositing (#2, #3)**: verify the depth encoding against the
  official DoF sample (linearization, possible reverse-Z) before building the
  intersection test; a half-pixel error reads as spheres clipping through
  buildings — worse than no demo.
- **Accumulation (#3)**: reset on camera change (compare `camera.viewMatrix`
  per frame), on resize, and on slider changes; `retain()`/`release()`
  bookkeeping must be exact or the engine leaks FBOs. `requestRender()` loop
  only while converging — stop at a sample cap (e.g. 512 SPP) to spare
  laptops.
- **SwiftShader**: ray/path tracing per-pixel loops are heavy on software GL —
  cap default resolution of the traced pass (half-res + upscale is acceptable
  if labeled) and verify e2e timeouts; the smoke test asserts render + no
  errors, not frame rate.
- **Honesty guards**: the mirror sphere's environment fallback is
  screen-space and the caption says so; the path tracer's emissive quad is
  synthetic and the caption says so. No claim that the CITY is ray-traced.
- Sun color/intensity: use `sunLight.diffuse`/`ambient` so our materials react
  to dawn/dusk color exactly like the engine's own.
