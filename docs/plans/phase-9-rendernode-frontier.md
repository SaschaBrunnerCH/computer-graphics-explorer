# Phase 9 — The RenderNode Frontier (3 demos + 1 stretch mode)

> **Status: COMPLETE — 3 demos shipped 2026-07-02; `scene-path-trace`
> reworked 2026-07-11; IBL stretch NOT shipped** (per the degrade rule below).
> The build surfaced the phase's biggest finding: injecting geometry at
> `opaque-color` (the windmills sample's slot) gets silently erased by the
> engine's downstream resolve in SDK v5 — framebuffer readback proved pixels
> written, then replaced. All custom passes now target `composite-color`. Also
> verified: the render-coordinate frame is stable across navigation (no drift,
> pixel-identical round-trip), `bindRenderTarget()` needs an explicit
> `camera.viewport` set, and the path tracer's reset-to-1-SPP-on-move behaves
> exactly as designed. Full log in DECISIONS.md.

## 2026-07-11 — Architectural path-tracing rework

The original demo shipped on 2026-07-02 with five analytic spheres, a
synthetic emissive light, and Zurich as a rasterized backdrop. It performed
real stochastic light transport and progressive accumulation, but the toy
scene did not demonstrate a credible GIS integration use case. That historical
implementation is superseded, not retroactively relabeled.

`scene-path-trace` now presents an external-renderer architectural
visualization. Three deterministic red, warm-white, and teal pavilions are
assembled from fixed-seed stacked convex tiers around a neutral traced
foundation. Exact ray/half-space intersections keep the scene bounded without
mesh traversal, a BVH, or SDF marching. Nearby colored faces make diffuse
transfer and contact darkening readable on the white pavilion and foundation.

ArcGIS continues to rasterize the satellite basemap, terrain, and existing
surroundings; only the proposal participates in path-traced light transport. The
RenderNode consumes and produces `composite-color`, uses the ArcGIS depth
buffer so rasterized geometry can occlude the proposal, and reads the engine's
real `sunLight` direction, diffuse color, intensity, and ambient contribution.
The collapsed `<arcgis-daylight>` date and time controls therefore move the
same geolocated sun for both renderers and authoritatively reset accumulation.
Camera, viewport, bounce, sample-mode, or sun changes likewise restart the image
at 1 SPP; a stationary view converges to the 512-SPP cap. A sun below the
horizon is handled honestly as ambient-sky-only lighting.

The procedural architecture is independently authored. The linked Sci-fi
Building Shapes Shadertoy is visual inspiration only; none of its CC
BY-NC-SA-licensed GLSL is copied into this MIT project.

The second re-audit of 2026-07-02 established that `RenderNode` is not just
post-processing: the official
[windmills sample](https://developers.arcgis.com/javascript/latest/sample-code/custom-render-node-windmills/)
injects **custom geometry with custom shaders** into the scene (depth-tested
against the real city, ECEF render coordinates via `toRenderCoordinates()`),
`RenderNode.sunLight` exposes the **engine's actual light** (a verified
surface-to-sun direction plus ambient/diffuse color), and retained FBOs accumulate across
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
for fullscreen ray-primitive intersection; #3 reuses the depth-compositing and
accumulation foundation while replacing toy ray primitives with bounded convex
architecture. Each demo degrades to not-shipping rather than faking.

| # | Demo key | Companion to | Idea & honest lever |
|---|----------|--------------|---------------------|
| 1 | `scene-material-lab` | shading-models, brdf | A sphere of OUR geometry (windmills pattern: VBO in render coordinates around a local origin over a plaza, drawn into `opaque-color` via `bindRenderTarget()` with depth test on) shaded by OUR shaders, lit by `this.sunLight` — the same sun shading the city around it. Levers: SegmentedControl **Flat / Gouraud / Phong / PBR (GGX)** — four real shader implementations, the full historical spectrum the SDK itself doesn't expose — plus **roughness/metallic sliders** in the GGX mode with the analytic BRDF formula shown in the caption. Sweep the scene's daylight slider and the highlight moves identically on our sphere and on the city: proof it's one sun. Serves both terms with one injected object. |
| 2 | `hybrid-ray` | ray-tracing | A fullscreen `RenderNode` pass on `composite-color`: a **fragment-shader ray tracer** over 3–4 analytic spheres (one mirror, one glass-tinted, one matte) floating above the city — real primary rays, real shadow rays between the spheres, real mirror bounces (2–3 deep). Composited against the scene's **actual depth buffer** (linearized with `camera.near/far`, DoF-sample math) so the city occludes the spheres correctly, and the mirror sphere reflects the composite-color texture where rays exit the analytic set (labeled honestly as the screen-space fallback — the exact hybrid games ship). Levers: bounce-count slider (0 = silhouettes, 1 = reflections appear, 3 = inter-reflections), shadow-ray toggle. Caption: "the city is rasterized, the spheres are ray-traced — find the seam." |
| 3 | `scene-path-trace` | path-tracing, global-illumination | An **external progressive path tracer** renders only a deterministic architectural proposal: three red, warm-white, and teal pavilions built from fixed-seed stacked convex tiers, plus a neutral foundation. Exact ray/half-space intersections, explicit shadow rays, and cosine-weighted diffuse bounces use the engine's real `sunLight`; red and teal transfer converges onto the white receiver and foundation. `<arcgis-daylight>` moves the shared geolocated sun and resets the retained-FBO running mean, as do camera and setting changes. ArcGIS rasterizes the terrain and existing surroundings, then its depth buffer occludes the analytic proposal during `composite-color` integration — existing geometry does not participate in secondary rays. Levers: path tracing toggle, **indirect bounces** (0–3), and **show single sample**; live status converges from 1 to 512 SPP. |
| S | IBL mode in #1 (stretch) | image-based-lighting | A fourth material mode: the GGX sphere lit by a **procedural sky environment** whose sun position matches `sunLight` — split-sum-approximation sampling with a roughness-driven blur. Honest caption: the environment is synthetic (sun-matched), not a captured HDR — the r3f IBL demo has the real prefiltered environment; this shows the *lighting model* difference (analytic sun vs environment integral) under one real sun. Ship only if #1 lands cleanly with headroom. |

## Term data updates (all appends)

shading-models + brdf → `scene-material-lab`; ray-tracing → `hybrid-ray`;
path-tracing + global-illumination → `scene-path-trace`; image-based-lighting
→ `scene-material-lab` if the stretch mode lands. All keys also go into
`arcgisPlaygrounds`.

## Coverage after phase 9

**Achieved: 59 of 66** terms with an ArcGIS companion (IBL stretch not
shipped; the term stays parked). The
final 6 (rendering, radiosity, scene-graph, double-buffering,
gpu-vs-cpu-rendering, webgl-vs-webgpu) stay in the
[coverage report](../arcgis-companion-coverage.md)'s not-possible table —
watch item: Esri's WebGPU port.

## Risks / notes

- **Precision (#1, #3)**: ECEF coordinates exceed float32. #3 uses
  `renderCoordinateTransformAt()` to retain an east/north/up local-meter frame
  for its orientation-sensitive pavilions; treating global render axes as ENU
  is invalid for architectural geometry. Jitter or rotated buildings at close
  zoom means the local transform is wrong.
- **Depth compositing (#2, #3)**: verify the depth encoding against the
  official DoF sample (linearization, possible reverse-Z) before building the
  intersection test; a half-pixel error reads as the proposal clipping through
  terrain or buildings — worse than no demo.
- **Accumulation (#3)**: reset on camera change (compare `camera.viewMatrix`
  per frame), on resize, and on slider changes; `retain()`/`release()`
  bookkeeping must be exact or the engine leaks FBOs. `requestRender()` loop
  only while converging — stop at a sample cap (e.g. 512 SPP) to spare
  laptops.
- **SwiftShader**: ray/path tracing per-pixel loops are heavy on software GL.
  The full-resolution pass stays bounded at three pavilions, no more than nine
  convex tiers, three indirect bounces, one sample per pixel per frame, and 512
  SPP. An unusable result requires a design revision; an unlabeled half-scale
  target is not an allowed fallback. The smoke test asserts render + no errors,
  not frame rate.
- **Honesty guards**: the mirror sphere's environment fallback is
  screen-space and the caption says so. The path tracer explicitly says that
  ArcGIS rasterizes the terrain and surroundings while only the proposal
  participates in traced light transport; depth occlusion does not make
  existing geometry a secondary-ray participant.
- **Sun synchronization (#3)**: sample `sunLight.direction`, diffuse color and
  intensity explicitly at each hit, use its ambient contribution only for the
  restrained sky term, and do not add a second procedural sun lobe. The
  `<arcgis-daylight>` play buttons stay hidden so supported UI cannot pin the
  tracer in perpetual reset.
