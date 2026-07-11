/**
 * Immutable, analytic scene data for the architectural path-tracing playground.
 *
 * Coordinates in this module are local metres in an east/north/up frame. A
 * solid is the intersection of plane half-spaces `dot(normal, point) <= limit`.
 * The fixed-width packing mirrors the bounded loops used by the WebGL shader.
 * No value in the pavilion generation depends on the camera, daylight, frame,
 * or path-sampling random number generator.
 */

export type LocalPoint = readonly [east: number, north: number, up: number];
export type LinearRgb = readonly [red: number, green: number, blue: number];
type PlaneEquation = readonly [normalX: number, normalY: number, normalZ: number, limit: number];

export const PATH_TRACE_SITE = Object.freeze({
  longitude: 16.3075,
  latitude: 78.6565485,
  fallbackElevationMeters: 18.4,
  basemap: "satellite",
  ground: "world-elevation",
});

export const OSM_BUILDINGS = Object.freeze({
  id: "osm-3d-buildings-architectural-path-trace",
  title: "OSM 3D Buildings",
  url: "https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer",
});

export const METERS_PER_DEGREE_LATITUDE = 111_320;
export const METERS_PER_DEGREE_LONGITUDE =
  METERS_PER_DEGREE_LATITUDE * Math.cos((PATH_TRACE_SITE.latitude * Math.PI) / 180);

/** Camera position is relative to the resolved foundation-top anchor. */
export const INITIAL_CAMERA = Object.freeze({
  localPosition: [-90, 35, 50] as LocalPoint,
  heading: 111,
  tilt: 70,
});

export const INITIAL_LIGHTING = Object.freeze({
  dateIso: "2026-07-10T18:00:00.000Z",
  directShadowsEnabled: true,
  utcOffsetHours: 0,
});

export const TRACE_LIMITS = Object.freeze({
  minIndirectBounces: 0,
  maxIndirectBounces: 3,
  defaultIndirectBounces: 2,
  maxSamplesPerPixel: 512,
});

export const FOUNDATION = Object.freeze({
  widthMeters: 44,
  depthMeters: 46,
  topClearanceMeters: 0.15,
  minimumThicknessMeters: 0.5,
  terrainOverlapMeters: 0.3,
});

/** Center plus the four foundation corners, in the order queried by the UI. */
export const ELEVATION_SAMPLE_OFFSETS = Object.freeze([
  Object.freeze({ eastMeters: 0, northMeters: 0 }),
  Object.freeze({
    eastMeters: -FOUNDATION.widthMeters / 2,
    northMeters: -FOUNDATION.depthMeters / 2,
  }),
  Object.freeze({
    eastMeters: FOUNDATION.widthMeters / 2,
    northMeters: -FOUNDATION.depthMeters / 2,
  }),
  Object.freeze({
    eastMeters: FOUNDATION.widthMeters / 2,
    northMeters: FOUNDATION.depthMeters / 2,
  }),
  Object.freeze({
    eastMeters: -FOUNDATION.widthMeters / 2,
    northMeters: FOUNDATION.depthMeters / 2,
  }),
]);

export interface FoundationPlacement {
  readonly lowestElevationMeters: number;
  readonly highestElevationMeters: number;
  readonly topElevationMeters: number;
  readonly thicknessMeters: number;
}

/**
 * Resolves the foundation's absolute top elevation and local thickness from the
 * center/corner samples. Callers should substitute the site fallback before
 * calling when ArcGIS elevation querying fails.
 */
export function resolveFoundationPlacement(
  elevationSamplesMeters: readonly number[],
): FoundationPlacement {
  if (elevationSamplesMeters.length !== ELEVATION_SAMPLE_OFFSETS.length) {
    throw new RangeError(`Expected ${ELEVATION_SAMPLE_OFFSETS.length} elevation samples.`);
  }
  if (!elevationSamplesMeters.every(Number.isFinite)) {
    throw new RangeError("Elevation samples must all be finite numbers.");
  }

  const lowestElevationMeters = Math.min(...elevationSamplesMeters);
  const highestElevationMeters = Math.max(...elevationSamplesMeters);
  return Object.freeze({
    lowestElevationMeters,
    highestElevationMeters,
    topElevationMeters: highestElevationMeters + FOUNDATION.topClearanceMeters,
    thicknessMeters: Math.max(
      FOUNDATION.minimumThicknessMeters,
      highestElevationMeters - lowestElevationMeters + FOUNDATION.terrainOverlapMeters,
    ),
  });
}

/** Converts a small local scene offset to WGS84 longitude/latitude. */
export function siteOffsetToWgs84(
  eastMeters: number,
  northMeters: number,
): readonly [longitude: number, latitude: number] {
  return [
    PATH_TRACE_SITE.longitude + eastMeters / METERS_PER_DEGREE_LONGITUDE,
    PATH_TRACE_SITE.latitude + northMeters / METERS_PER_DEGREE_LATITUDE,
  ];
}

const srgbChannelToLinear = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

/** Decodes a CSS-style six-digit sRGB hex colour for lighting calculations. */
export function srgbHexToLinear(hex: string): LinearRgb {
  if (!/^#[0-9a-f]{6}$/iu.test(hex)) {
    throw new TypeError(`Expected a six-digit sRGB hex colour, received "${hex}".`);
  }

  const encoded = [
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  ] as const;
  return [
    srgbChannelToLinear(encoded[0]),
    srgbChannelToLinear(encoded[1]),
    srgbChannelToLinear(encoded[2]),
  ];
}

export const MATERIAL_INDICES = Object.freeze({
  red: 0,
  warmWhite: 1,
  teal: 2,
  foundation: 3,
});

export interface AnalyticMaterial {
  readonly id: "red" | "warm-white" | "teal" | "foundation";
  readonly srgbHex: string;
  readonly linearAlbedo: LinearRgb;
}

const material = (id: AnalyticMaterial["id"], srgbHex: string): AnalyticMaterial =>
  Object.freeze({ id, srgbHex, linearAlbedo: Object.freeze(srgbHexToLinear(srgbHex)) });

/** Material order is the material-index order uploaded to WebGL. */
export const MATERIALS = Object.freeze([
  material("red", "#c83446"),
  material("warm-white", "#eee8d8"),
  material("teal", "#238f8b"),
  material("foundation", "#a79e90"),
]);

export const PAVILION_SEEDS = Object.freeze({
  red: 0x13579bdf,
  warmWhite: 0x2468ace0,
  teal: 0xc0ffee11,
});

export const MAX_PAVILIONS = 3;
export const MAX_TIERS_PER_PAVILION = 3;
export const MAX_SOLID_COUNT = MAX_PAVILIONS * MAX_TIERS_PER_PAVILION + 1;
export const MAX_PLANES_PER_SOLID = 8;
export const PLANE_EQUATION_FLOATS = 4;
export const MATERIAL_ALBEDO_FLOATS = 3;

interface PavilionBlueprint {
  readonly id: "red" | "warm-white" | "teal";
  readonly seed: number;
  readonly materialIndex: number;
  readonly center: readonly [east: number, north: number];
  readonly baseRotationDegrees: number;
  readonly widthRange: readonly [minimum: number, maximum: number];
  readonly depthRange: readonly [minimum: number, maximum: number];
  readonly heightRange: readonly [minimum: number, maximum: number];
}

interface ConvexTier {
  readonly pavilionId: PavilionBlueprint["id"] | "foundation";
  readonly materialIndex: number;
  readonly center: LocalPoint;
  readonly widthMeters: number;
  readonly depthMeters: number;
  readonly heightMeters: number;
  readonly rotationRadians: number;
  readonly planes: readonly PlaneEquation[];
}

const PAVILION_BLUEPRINTS: readonly PavilionBlueprint[] = Object.freeze([
  Object.freeze({
    id: "red",
    seed: PAVILION_SEEDS.red,
    materialIndex: MATERIAL_INDICES.red,
    center: Object.freeze([-4, 10.5] as const),
    baseRotationDegrees: 58,
    widthRange: Object.freeze([11.5, 13] as const),
    depthRange: Object.freeze([7.5, 9] as const),
    heightRange: Object.freeze([14, 18] as const),
  }),
  Object.freeze({
    id: "warm-white",
    seed: PAVILION_SEEDS.warmWhite,
    materialIndex: MATERIAL_INDICES.warmWhite,
    center: Object.freeze([10, 0] as const),
    baseRotationDegrees: 90,
    widthRange: Object.freeze([14, 16] as const),
    depthRange: Object.freeze([7.5, 9] as const),
    heightRange: Object.freeze([20, 24] as const),
  }),
  Object.freeze({
    id: "teal",
    seed: PAVILION_SEEDS.teal,
    materialIndex: MATERIAL_INDICES.teal,
    center: Object.freeze([-5, -10.5] as const),
    baseRotationDegrees: -58,
    widthRange: Object.freeze([11.5, 13] as const),
    depthRange: Object.freeze([7.5, 9] as const),
    heightRange: Object.freeze([14, 18] as const),
  }),
]);

/** The same uint32 PCG permutation already used by the playground's shaders. */
class PcgRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  nextFloat(): number {
    this.state = (Math.imul(this.state, 747_796_405) + 2_891_336_453) >>> 0;
    const shift = (this.state >>> 28) + 4;
    let word = Math.imul((this.state >>> shift) ^ this.state, 277_803_737) >>> 0;
    word = ((word >>> 22) ^ word) >>> 0;
    return word / 4_294_967_296;
  }
}

const lerp = (minimum: number, maximum: number, t: number): number =>
  minimum + (maximum - minimum) * t;

const degreesToRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const cornerSigns = (corner: number): readonly [uSign: number, vSign: number] => {
  switch (corner & 3) {
    case 0:
      return [1, 1];
    case 1:
      return [-1, 1];
    case 2:
      return [-1, -1];
    default:
      return [1, -1];
  }
};

const buildTierPlanes = (
  center: LocalPoint,
  widthMeters: number,
  depthMeters: number,
  heightMeters: number,
  rotationRadians: number,
  clipCorner: number,
  clipAmounts: readonly [number, number],
): readonly PlaneEquation[] => {
  const cos = Math.cos(rotationRadians);
  const sin = Math.sin(rotationRadians);
  const u = [cos, sin] as const;
  const v = [-sin, cos] as const;
  const halfWidth = widthMeters / 2;
  const halfDepth = depthMeters / 2;
  const centerDot = (axis: readonly [number, number]): number =>
    axis[0] * center[0] + axis[1] * center[1];

  const planes: PlaneEquation[] = [
    [0, 0, -1, -center[2]],
    [0, 0, 1, center[2] + heightMeters],
    [u[0], u[1], 0, centerDot(u) + halfWidth],
    [-u[0], -u[1], 0, -centerDot(u) + halfWidth],
    [v[0], v[1], 0, centerDot(v) + halfDepth],
    [-v[0], -v[1], 0, -centerDot(v) + halfDepth],
  ];

  for (let clipIndex = 0; clipIndex < 2; clipIndex += 1) {
    const [uSign, vSign] = cornerSigns(clipCorner + clipIndex * 2);
    const inverseSqrtTwo = Math.SQRT1_2;
    const normal = [
      (uSign * u[0] + vSign * v[0]) * inverseSqrtTwo,
      (uSign * u[1] + vSign * v[1]) * inverseSqrtTwo,
    ] as const;
    const uncutLimit = (halfWidth + halfDepth) * inverseSqrtTwo;
    planes.push([
      normal[0],
      normal[1],
      0,
      centerDot(normal) + uncutLimit - clipAmounts[clipIndex] * inverseSqrtTwo,
    ]);
  }

  return Object.freeze(planes.map((plane) => Object.freeze(plane)));
};

const splitTierHeights = (
  totalHeightMeters: number,
  tierCount: number,
  random: PcgRandom,
): readonly number[] => {
  if (tierCount === 2) {
    const lowerFraction = lerp(0.58, 0.66, random.nextFloat());
    return Object.freeze([
      totalHeightMeters * lowerFraction,
      totalHeightMeters * (1 - lowerFraction),
    ]);
  }

  const lowerFraction = lerp(0.43, 0.49, random.nextFloat());
  const middleFraction = lerp(0.28, 0.33, random.nextFloat());
  return Object.freeze([
    totalHeightMeters * lowerFraction,
    totalHeightMeters * middleFraction,
    totalHeightMeters * (1 - lowerFraction - middleFraction),
  ]);
};

const generatePavilion = (blueprint: PavilionBlueprint): readonly ConvexTier[] => {
  const random = new PcgRandom(blueprint.seed);
  const totalHeightMeters = lerp(...blueprint.heightRange, random.nextFloat());
  const baseWidthMeters = lerp(...blueprint.widthRange, random.nextFloat());
  const baseDepthMeters = lerp(...blueprint.depthRange, random.nextFloat());
  const baseRotationRadians = degreesToRadians(
    blueprint.baseRotationDegrees + lerp(-3, 3, random.nextFloat()),
  );
  const tierCount = random.nextFloat() > 0.7 ? 3 : 2;
  const tierHeights = splitTierHeights(totalHeightMeters, tierCount, random);

  const tiers: ConvexTier[] = [];
  let floorMeters = 0;
  let widthMeters = baseWidthMeters;
  let depthMeters = baseDepthMeters;
  let centerEast = blueprint.center[0];
  let centerNorth = blueprint.center[1];

  for (let tierIndex = 0; tierIndex < tierCount; tierIndex += 1) {
    if (tierIndex > 0) {
      widthMeters -= 2 * lerp(0.65, 1.05, random.nextFloat());
      depthMeters -= 2 * lerp(0.55, 0.9, random.nextFloat());
      centerEast += lerp(-0.35, 0.35, random.nextFloat());
      centerNorth += lerp(-0.35, 0.35, random.nextFloat());
    }

    const rotationRadians =
      baseRotationRadians + degreesToRadians(lerp(-1.25, 1.25, random.nextFloat()));
    const maximumClip = Math.min(widthMeters, depthMeters) * 0.24;
    const clips = [
      lerp(0.75, maximumClip, random.nextFloat()),
      lerp(0.75, maximumClip, random.nextFloat()),
    ] as const;
    const clipCorner = Math.floor(random.nextFloat() * 4);
    const heightMeters = tierHeights[tierIndex];
    const center = Object.freeze([centerEast, centerNorth, floorMeters] as LocalPoint);

    tiers.push(
      Object.freeze({
        pavilionId: blueprint.id,
        materialIndex: blueprint.materialIndex,
        center,
        widthMeters,
        depthMeters,
        heightMeters,
        rotationRadians,
        planes: buildTierPlanes(
          center,
          widthMeters,
          depthMeters,
          heightMeters,
          rotationRadians,
          clipCorner,
          clips,
        ),
      }),
    );
    floorMeters += heightMeters;
  }

  return Object.freeze(tiers);
};

/** Pavilion generation happens exactly once, during module initialization. */
const PAVILION_TIERS = Object.freeze(PAVILION_BLUEPRINTS.flatMap(generatePavilion));

export const PAVILION_TIER_COUNT = PAVILION_TIERS.length;
export const FOUNDATION_SOLID_INDEX = PAVILION_TIER_COUNT;

const buildFoundation = (thicknessMeters: number): ConvexTier => {
  const center = Object.freeze([0, 0, -thicknessMeters / 2] as LocalPoint);
  const halfWidth = FOUNDATION.widthMeters / 2;
  const halfDepth = FOUNDATION.depthMeters / 2;
  const planes = Object.freeze([
    Object.freeze([0, 0, -1, thicknessMeters] as PlaneEquation),
    Object.freeze([0, 0, 1, 0] as PlaneEquation),
    Object.freeze([1, 0, 0, halfWidth] as PlaneEquation),
    Object.freeze([-1, 0, 0, halfWidth] as PlaneEquation),
    Object.freeze([0, 1, 0, halfDepth] as PlaneEquation),
    Object.freeze([0, -1, 0, halfDepth] as PlaneEquation),
  ]);
  return Object.freeze({
    pavilionId: "foundation",
    materialIndex: MATERIAL_INDICES.foundation,
    center,
    widthMeters: FOUNDATION.widthMeters,
    depthMeters: FOUNDATION.depthMeters,
    heightMeters: thicknessMeters,
    rotationRadians: 0,
    planes,
  });
};

const assertPavilionInvariants = (): void => {
  if (PAVILION_BLUEPRINTS.length !== MAX_PAVILIONS) {
    throw new Error(`Expected exactly ${MAX_PAVILIONS} pavilion blueprints.`);
  }
  if (PAVILION_TIER_COUNT + 1 > MAX_SOLID_COUNT) {
    throw new Error("Generated scene exceeds the shader's solid bound.");
  }

  let minimumEast = Number.POSITIVE_INFINITY;
  let maximumEast = Number.NEGATIVE_INFINITY;
  let minimumNorth = Number.POSITIVE_INFINITY;
  let maximumNorth = Number.NEGATIVE_INFINITY;

  for (const blueprint of PAVILION_BLUEPRINTS) {
    const tiers = PAVILION_TIERS.filter(({ pavilionId }) => pavilionId === blueprint.id);
    if (tiers.length < 2 || tiers.length > MAX_TIERS_PER_PAVILION) {
      throw new Error(`${blueprint.id} must contain two or three tiers.`);
    }
    const totalHeight = tiers.reduce((sum, tier) => sum + tier.heightMeters, 0);
    if (totalHeight < 12 || totalHeight > 24) {
      throw new Error(`${blueprint.id} height must remain within 12–24 metres.`);
    }

    for (const tier of tiers) {
      if (tier.planes.length > MAX_PLANES_PER_SOLID) {
        throw new Error(`${blueprint.id} tier exceeds the shader's plane bound.`);
      }
      const cos = Math.cos(tier.rotationRadians);
      const sin = Math.sin(tier.rotationRadians);
      const eastRadius =
        Math.abs(cos) * (tier.widthMeters / 2) + Math.abs(sin) * (tier.depthMeters / 2);
      const northRadius =
        Math.abs(sin) * (tier.widthMeters / 2) + Math.abs(cos) * (tier.depthMeters / 2);
      minimumEast = Math.min(minimumEast, tier.center[0] - eastRadius);
      maximumEast = Math.max(maximumEast, tier.center[0] + eastRadius);
      minimumNorth = Math.min(minimumNorth, tier.center[1] - northRadius);
      maximumNorth = Math.max(maximumNorth, tier.center[1] + northRadius);

      for (const plane of tier.planes) {
        if (!plane.every(Number.isFinite))
          throw new Error("Generated a non-finite plane equation.");
        const normalLength = Math.hypot(plane[0], plane[1], plane[2]);
        if (Math.abs(normalLength - 1) > 1e-10) {
          throw new Error("Every analytic plane normal must be unit length.");
        }
      }
    }
  }

  if (maximumEast - minimumEast > 48 || maximumNorth - minimumNorth > 48) {
    throw new Error("Generated pavilions exceed the approved 48-metre courtyard width.");
  }
};

assertPavilionInvariants();

export interface PackedAnalyticScene {
  /** Number of populated entries; the remaining fixed-capacity slots are zeroed. */
  readonly solidCount: number;
  readonly pavilionTierCount: number;
  readonly foundationSolidIndex: number;
  readonly materialCount: number;
  /** `[nx, ny, nz, limit]`, eight slots per solid. */
  readonly planeEquations: Float32Array;
  /** One active plane count per fixed-capacity solid slot. */
  readonly planeCounts: Int32Array;
  /** One material-array index per fixed-capacity solid slot. */
  readonly materialIndices: Int32Array;
  /** Linear RGB triples in `MATERIALS` order. */
  readonly materialAlbedos: Float32Array;
}

/**
 * Returns upload-ready arrays owned by the caller. Pavilion tiers are copied
 * from the one-time deterministic generation; only foundation thickness varies
 * with the resolved terrain samples.
 */
export function createPackedScene(
  foundationThicknessMeters: number = FOUNDATION.minimumThicknessMeters,
): PackedAnalyticScene {
  if (
    !Number.isFinite(foundationThicknessMeters) ||
    foundationThicknessMeters < FOUNDATION.minimumThicknessMeters
  ) {
    throw new RangeError(
      `Foundation thickness must be at least ${FOUNDATION.minimumThicknessMeters} metres.`,
    );
  }

  const solids = [...PAVILION_TIERS, buildFoundation(foundationThicknessMeters)];
  const planeEquations = new Float32Array(
    MAX_SOLID_COUNT * MAX_PLANES_PER_SOLID * PLANE_EQUATION_FLOATS,
  );
  const planeCounts = new Int32Array(MAX_SOLID_COUNT);
  const materialIndices = new Int32Array(MAX_SOLID_COUNT);
  materialIndices.fill(-1);

  for (let solidIndex = 0; solidIndex < solids.length; solidIndex += 1) {
    const solid = solids[solidIndex];
    planeCounts[solidIndex] = solid.planes.length;
    materialIndices[solidIndex] = solid.materialIndex;
    for (let planeIndex = 0; planeIndex < solid.planes.length; planeIndex += 1) {
      const destination = (solidIndex * MAX_PLANES_PER_SOLID + planeIndex) * PLANE_EQUATION_FLOATS;
      planeEquations.set(solid.planes[planeIndex], destination);
    }
  }

  const materialAlbedos = new Float32Array(MATERIALS.length * MATERIAL_ALBEDO_FLOATS);
  for (let materialIndex = 0; materialIndex < MATERIALS.length; materialIndex += 1) {
    materialAlbedos.set(MATERIALS[materialIndex].linearAlbedo, materialIndex * 3);
  }

  return Object.freeze({
    solidCount: solids.length,
    pavilionTierCount: PAVILION_TIER_COUNT,
    foundationSolidIndex: FOUNDATION_SOLID_INDEX,
    materialCount: MATERIALS.length,
    planeEquations,
    planeCounts,
    materialIndices,
    materialAlbedos,
  });
}
