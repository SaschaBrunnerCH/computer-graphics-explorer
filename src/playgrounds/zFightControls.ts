/**
 * Keep both z-fighting demonstrations on the same deliberately small offset
 * scale. Larger offsets hide the precision lesson instead of exposing it.
 */
export const Z_FIGHT_OFFSET = {
  minCm: 0,
  maxCm: 1,
  stepCm: 0.05,
} as const;

export function formatZFightOffset(cm: number): string {
  return `${cm.toFixed(2)} cm`;
}
