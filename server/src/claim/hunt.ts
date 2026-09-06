/** La chasse du jour (spec 2.3) : cinq marques, tirées à 00:00 UTC, révélées par commit-reveal. */

export const HUNT_SIZE = 5;

export function dayIndex(nowMs: number): number {
  return Math.floor(nowMs / 1000 / 86400);
}

export function isInHunt(huntBrandIds: readonly number[], brandId: number): boolean {
  return huntBrandIds.includes(brandId);
}

/** Secondes avant le prochain 00:00 UTC — « réarmement dans 9 h 12 ». */
export function secondsUntilReset(nowMs: number): number {
  const day = dayIndex(nowMs);
  return (day + 1) * 86400 - Math.floor(nowMs / 1000);
}
