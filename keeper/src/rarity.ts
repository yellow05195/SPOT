/**
 * La rareté est émergente, pas décidée (spec 2.2). Recalculée chaque nuit sur les prises mondiales
 * des 7 derniers jours :
 *
 *   part[marque]   = prises[marque] / prises_totales
 *   rareté[marque] = clamp( 1 / (part[marque] × N_marques), 0.4, 8.0 )
 *
 * Le contrat borne lui-même la variation à ±35 % par nuit ; on l'applique aussi ici pour que les
 * valeurs envoyées soient celles qui seront retenues (et loguées correctement).
 */

export const RARITY_MIN = 0.4;
export const RARITY_MAX = 8.0;
export const MAX_STEP = 0.35;
export const SCALE = 1000; // millièmes on-chain

export interface RarityInput {
  brandId: number;
  prises7d: number;
  current: number;
}

export function rawRarity(prises: number, total: number, nBrands: number): number {
  if (nBrands === 0) return 1;
  // une marque jamais vue est « infiniment » rare : plafond
  if (total === 0 || prises === 0) return RARITY_MAX;
  const share = prises / total;
  return clamp(1 / (share * nBrands), RARITY_MIN, RARITY_MAX);
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function boundedStep(current: number, target: number): number {
  const hi = current * (1 + MAX_STEP);
  const lo = current * (1 - MAX_STEP);
  return clamp(clamp(target, lo, hi), RARITY_MIN, RARITY_MAX);
}

export function computeRarities(inputs: RarityInput[]): { brandId: number; target: number; applied: number }[] {
  const total = inputs.reduce((s, i) => s + i.prises7d, 0);
  const n = inputs.length;
  return inputs.map((i) => {
    const target = rawRarity(i.prises7d, total, n);
    return { brandId: i.brandId, target, applied: boundedStep(i.current, target) };
  });
}

export function toChain(r: number): number {
  return Math.round(r * SCALE);
}

export function fromChain(v: number): number {
  return v / SCALE;
}
