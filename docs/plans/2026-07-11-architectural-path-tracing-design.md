# Architectural Path-Tracing Playbook Redesign

**Status:** Approved design

**Date:** 2026-07-11

**Scope:** Replace the ArcGIS `scene-path-trace` sphere toy with a credible,
sun-synchronized procedural-architecture case study.

## Problem

The current ArcGIS path-tracing playground performs real Monte Carlo
accumulation, but only five synthetic spheres participate in light transport.
Zurich is a rasterized backdrop, and a synthetic emissive sphere is the primary
light. It demonstrates the rendering mechanics, but it is not a realistic
integration use case. The redesign therefore looks for a credible real-world
case where an external renderer adds something meaningful to an ArcGIS scene.

The relevant RenderNode capabilities are:

- progressive refinement over multiple frames;
- depth-buffer compositing against the ArcGIS scene;
- using `RenderNode.sunLight` instead of a synthetic white light;
- procedural mathematical buildings rather than a mesh/BVH project;
- nearby colored buildings that reveal indirect color transfer and contact
  darkening;
- reset-to-noise and reconvergence after movement or lighting changes;
- framing the feature as an external renderer integrated into ArcGIS rather
  than a native ArcGIS path tracer.

## Goals

1. Demonstrate a plausible external-renderer integration through RenderNode.
2. Make indirect illumination visible through red and teal color bleeding onto
   a warm-white building and neutral foundation.
3. Use the real geolocated ArcGIS sun for both the rasterized scene and custom
   renderer.
4. Preserve progressive convergence, camera/depth integration, and the honest
   limitations of a small analytic scene.
5. Keep the demo deterministic, keyless, bounded for WebGL2, and usable under
   the repository's SwiftShader test configuration.

## Non-goals

- Path-tracing the existing ArcGIS terrain or OSM buildings.
- Importing arbitrary meshes or implementing triangle traversal or a BVH.
- Copying or adapting the referenced Shadertoy GLSL.
- Volumetric smoke, clouds, denoising, glossy transport, refraction, or a
  production renderer.
- Regenerating the procedural buildings at runtime.
- Presenting the conceptual buildings as an approved or buildable proposal.

## Experience and Narrative

The playground becomes a conceptual architectural visualization. Three small
procedural pavilions sit close together on a shared foundation so direct
shadows, contact darkening, and indirect colour transfer are easy to compare
inside a real geographic scene.

The user-facing framing must say:

- ArcGIS rasterizes the satellite basemap, terrain, and existing surroundings.
- A custom path tracer renders only the three pavilions and their foundation.
- RenderNode combines the two images using the ArcGIS depth buffer.
- Both renderers read the same geolocated sun.
- Existing ArcGIS geometry can hide the proposal in primary visibility, but it
  does not cast traced secondary-ray shadows or exchange indirect light with
  the proposal.

The proposed title is **"External path tracing — architectural
visualization"**. The explanatory copy links the original
[Sci-fi Building Shapes Shadertoy](https://www.shadertoy.com/view/wdjSDG) as
visual inspiration and states that the implementation is independently
authored.

The site's identity is an implementation detail, not part of the use case.
User-facing copy, documentation, internal identifiers, tests, filenames,
branch names, and local commit messages use location-neutral terminology. The
fixed coordinates remain only as reproducible scene data for terrain, depth,
and geolocated sunlight.

## Georeferenced Scene, Camera, and Daylight

### Georeferenced scene

- Anchor: longitude `16.3075000`, latitude `78.6565485`.
- Placement: an open area suitable for the 48 m conceptual courtyard.
- Maximum courtyard width: 48 m.
- Technical site check: no current OSM building footprint lies within 40 m of
  the anchor, while the public OSM 3D SceneLayer provides nearby geographic
  context.
- Basemap: `satellite`.
- Ground: `world-elevation`.
- Context layer: the existing public `OpenStreetMap3D_Buildings_v1`
  SceneServer.

The component queries the anchor and four foundation corners. The
foundation top sits 0.15 m above the highest returned elevation. Its thickness
is `max(0.5 m, highest - lowest + 0.30 m)`, which places its base at least
0.15 m below the lowest sample so it cannot appear to float. If elevation
queries fail, use the verified terrain fallback of 18.4 m for all five samples.

### Camera

The initial camera is computed from the resolved local east/north/up frame:

- position: 90 m west, 35 m north, and 50 m above the courtyard anchor;
- heading: 111° toward the east-southeast;
- tilt: 70°;

This frames the courtyard first, with the geographic surroundings behind it.
Reset restores this camera.

### Daylight

The scene uses `SunLighting` with direct shadows enabled. Initial time is
`2026-07-10T18:00:00Z`, providing low, long shadows.

Register and render `<arcgis-daylight>` in the scene's top-right slot with:

- date picker and daytime slider visible;
- UTC displayed explicitly (`utcOffset={0}`);
- play buttons hidden, because continuous sun animation would prevent
  convergence;
- engine shadow and sun-lighting toggles hidden, keeping the comparison on one
  controlled light source.

`arcgisUserDateTimeChange` immediately marks the UI as reconverging and
requests a render. The RenderNode's sun signature remains the authoritative
accumulation invalidation mechanism.

A sun below the horizon is valid behavior. When the ArcGIS sun contributes no
direct energy, the custom scene converges under dim ambient sky and the caption
says "Sun below horizon — ambient sky only; choose a daytime with direct sun."

## Procedural Courtyard

The geometry is an independent implementation inspired by the reference's
general idea of seeded, stacked architectural volumes. The reference source is
CC BY-NC-SA 4.0, which is incompatible with direct reuse in this MIT project.
Do not copy its `Polygon`, `BevelMax`, hash constants, tracing code, or other
GLSL expressions.

Use the repository's existing PCG-style hashing to derive immutable dimensions
from these fixed seeds:

- red pavilion: `0x13579bdf`, sRGB `#c83446`;
- warm-white pavilion: `0x2468ace0`, sRGB `#eee8d8`;
- teal pavilion: `0xc0ffee11`, sRGB `#238f8b`.

Convert colors to linear space before transport. Each pavilion contains two or
three stacked convex tiers. A tier is the intersection of at most eight
half-spaces: floor, roof, four main sides, and up to two diagonal corner clips.
Seeded values control tier width, depth, height, inset, clip amount, and small
rotation. Generation runs once during module initialization; geometry never
depends on frame number, time, camera, or sampling RNG.

Layout A is a shallow courtyard:

- the warm-white pavilion is the taller rear receiver;
- red sits front-left and teal front-right;
- their inward faces point toward the white receiver;
- gaps remain 4–7 m so indirect transfer and contact darkening are visible;
- the courtyard opens west toward the initial camera;
- total occupied width remains at or below 48 m;
- pavilion heights remain between 12 and 24 m.

A neutral, warm-gray convex foundation surrounds the cluster. It belongs to the
analytic path-traced scene, receives direct shadows and indirect color, and
hides small terrain-height variation.

## Architecture

Split the current 850-line component into three focused units:

### `src/playgrounds/arcgis/ScenePathTrace.tsx`

Owns React and ArcGIS orchestration:

- scene and daylight component registration;
- UI state and captions;
- scene/layer initialization;
- elevation queries and local-frame creation;
- camera, lighting, reset, and unmount behavior;
- RenderNode construction and destruction;
- status callbacks from the RenderNode.

### `src/playgrounds/arcgis/scene-path-trace/scene.ts`

Owns immutable analytic-scene data:

- georeferenced scene constants;
- fixed seeds and sRGB-to-linear materials;
- deterministic convex-tier generation;
- shallow-courtyard placement;
- packed typed arrays and invariants for shader upload.

This module has no React or ArcGIS component dependencies.

### `src/playgrounds/arcgis/scene-path-trace/renderNode.ts`

Owns the custom renderer:

- shader sources and compilation;
- exact ray/convex-half-space intersection;
- path integration and procedural shadow rays;
- camera, local-frame, sun, and geometry uniforms;
- retained framebuffer lifecycle;
- accumulation signatures and sample callbacks;
- depth-buffer compositing and WebGL state restoration.

The RenderNode continues to consume and produce `composite-color`; the
repository has verified that custom changes at `opaque-color` are overwritten
by the SDK's downstream resolve.

## Coordinate Flow

1. Resolve anchor and foundation elevations in WGS84.
2. Use `webgl.renderCoordinateTransformAt()` to build a local
   east/north/up-to-render transform at the anchor.
3. Derive and retain its inverse for render-to-local ray conversion.
4. Keep pavilion and foundation data in small local meter coordinates.
5. Every frame, derive primary rays from `RenderCamera.eye`, `center`, `up`,
   `fovX`, and `fovY` without inverting the projection matrix.
6. Transform the eye and directions into the local frame before analytic
   intersections.
7. Compare the nearest analytic primary hit with the linearized ArcGIS depth;
   a nearer ArcGIS pixel wins.

The local frame is required because buildings are orientation-sensitive.
Treating global render axes as east/north/up, as rotationally symmetric spheres
could tolerate, is invalid for orientation-sensitive architecture.

## Light Transport

Each frame casts one independently seeded path per pixel.

1. Jitter the primary ray within the pixel.
2. Find the nearest convex-tier or foundation hit.
3. Reject it when the ArcGIS depth buffer contains nearer rasterized geometry.
4. At every diffuse hit, explicitly sample the directional ArcGIS sun:
   - surface-to-sun direction from `sunLight.direction` (verified against the
     astronomical altitude in SDK 5.0.19 despite its legacy "incident"
     wording);
   - radiance from the sun's diffuse color and intensity;
   - cast a shadow ray against all analytic geometry;
   - add the unoccluded Lambertian direct term.
5. Sample a cosine-weighted diffuse direction, multiply throughput by surface
   albedo, and continue until the configured indirect-bounce budget is spent.
6. On escape, sample a restrained sky/ambient term derived from the ArcGIS
   ambient light. Do not add a second procedural sun lobe, which would
   double-count the explicitly sampled sun.

The control is labeled **"Indirect bounces"**, ranges from 0 to 3, and defaults
to 2. Zero is a direct-only comparison; one or more enables genuine color
transfer. No Russian roulette is needed at this bounded depth.

## Accumulation and UI State

Continue the existing retained-ManagedFBO running mean, one sample per pixel
per frame, capped at 512 SPP. Preserve exact `retain()`/`release()` ownership.

Reset accumulation when any of these change:

- drawing-buffer width or height;
- camera eye, center, up, or field of view beyond existing tolerances;
- indirect-bounce count;
- single-sample mode;
- sun direction;
- sun diffuse color or intensity;
- sun ambient color or intensity.

The immutable local frame and procedural geometry do not enter the per-frame
signature because changing either requires node reconstruction.

Expose these stage states through a compact status chip and the live caption:

- `Loading site…`;
- `Converging · N / 512 SPP`;
- `Converged · 512 SPP`;
- `Single sample · accumulation disabled`;
- `Sun below horizon · ambient sky only`;
- `Path tracing off`;
- initialization or shader failure.

Controls remain:

- Path tracing on/off;
- Indirect bounces, 0–3;
- Show single sample.

Turning path tracing off destroys the custom node and shows pure ArcGIS
rasterization; turning it back on reconstructs the same deterministic proposal.
Reset restores the initial camera, lighting date, enabled state, two indirect
bounces, accumulated mode, and 1 SPP.

## Failure Handling and Lifecycle

- Elevation-query failure uses the verified 18.4 m fallback and records that
  fallback in the caption.
- Local-coordinate transform failure does not create a RenderNode; the ArcGIS
  scene remains interactive and the caption explains that the proposal could
  not initialize.
- Shader compilation or program linking failure marks the node broken and
  passes `composite-color` through untouched.
- Stale asynchronous initialization after StrictMode teardown must not create a
  node for a destroyed view.
- Destroying or replacing the node releases its retained accumulation FBO
  before `destroy()`.
- `resetWebGLState()` runs after custom drawing.
- The render loop requests another frame only while below 512 SPP.
- Daylight play buttons remain hidden so supported UI cannot accidentally pin
  the render loop in perpetual reset.

## Performance Bounds

- Three pavilions.
- At most three tiers per pavilion, plus one foundation.
- At most eight half-spaces per tier.
- At most three indirect bounces.
- One sample per pixel per frame.
- 512-SPP hard cap.
- No mesh uploads, triangle loops, BVH, recursive shader functions, or SDF
  sphere-marching loops.

The implementation remains full-resolution. Exact convex intersections
replace the current sphere intersections without introducing the unbounded step
count of SDF ray marching. A lower-resolution trace target is not authorized by
this design; an unusable SwiftShader result requires a design revision rather
than an unlabeled quality reduction.

## Verification

### Automated

Add a focused Playwright test for `#/term/path-tracing` that:

1. waits for the ArcGIS scene canvas;
2. asserts the daylight expand control starts collapsed and its content hidden;
3. opens the control and asserts `arcgis-daylight` becomes visible;
4. asserts its `hidePlayButtons` property is true;
5. waits until the live caption reports more than one sample;
6. changes time through the rendered daylight control;
7. observes the sample count reset to 1 and then increase again;
8. records no page errors.

Run:

- `npm run typecheck`;
- `npm run lint`;
- `npm run build`;
- `npm run test:e2e`.

### Driven visual verification

On a real GPU, verify:

- exactly three stable buildings appear on the foundation after every reset;
- their shapes and positions do not change with time or camera movement;
- red and teal transfer becomes visible on the white pavilion and foundation;
- zero indirect bounces removes that transfer while preserving direct sun;
- daylight changes rotate direct shadows and restart convergence;
- a date with the sun below the horizon yields ambient-only lighting without
  failure;
- nearby rasterized geometry can occlude the custom proposal correctly;
- the foundation neither sinks into nor floats above the terrain;
- moving the camera resets to noisy 1-SPP output and holding still reconverges;
- path tracing off shows the untouched ArcGIS scene;
- no retained-FBO leak appears across repeated toggles, resets, or navigation.

## Documentation Updates During Implementation

Update these existing descriptions without rewriting historical audit results:

- `docs/PLAN.md` phase-9 summary;
- `docs/arcgis-companion-coverage.md` path-tracing and global-illumination rows;
- `docs/plans/phase-9-rendernode-frontier.md` with a dated rework note;
- `DECISIONS.md` with the independent convex-geometry, real-sun, and
  daylight-reset decisions.

The registry key and term associations remain unchanged.

## Acceptance Criteria

The redesign is complete when:

1. the sphere cluster and synthetic emissive light are removed;
2. three fixed-seed convex pavilions and their foundation render in the
   georeferenced scene;
3. the custom renderer uses the ArcGIS sun direction, color, and intensity;
4. direct sun, analytic shadow rays, progressive accumulation, and stochastic
   diffuse bounces all run in the custom RenderNode;
5. red/teal indirect transfer is visibly distinguishable from the direct-only
   setting;
6. `<arcgis-daylight>` changes date and time, hides play controls, and resets
   accumulation correctly;
7. camera movement, resize, settings, and sun changes all reset history;
8. ArcGIS depth correctly occludes the analytic proposal;
9. UI copy never claims the existing surroundings are path-traced;
10. shader/initialization failures degrade to an untouched ArcGIS scene;
11. automated checks pass and the real-GPU visual checklist is satisfied;
12. documentation no longer describes the ArcGIS companion as a sphere demo.

## References

- [Referenced Shadertoy: Sci-fi Building Shapes](https://www.shadertoy.com/view/wdjSDG)
- [CC BY-NC-SA 4.0 terms](https://creativecommons.org/licenses/by-nc-sa/4.0/)
- [ArcGIS RenderNode](https://developers.arcgis.com/javascript/latest/api-reference/esri-views-3d-webgl-RenderNode.html)
- [ArcGIS 3D WebGL coordinate utilities](https://developers.arcgis.com/javascript/latest/references/core/views/3d/webgl/)
- [ArcGIS Daylight component](https://developers.arcgis.com/javascript/latest/references/map-components/components/arcgis-daylight/)
