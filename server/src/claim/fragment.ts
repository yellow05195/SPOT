/**
 * Le calcul d'un fragment (spec 2.4) :
 *
 *   valeur_usd = budget_journalier × coefficient_rareté × facteur_chasse (1,0 | 0,3)
 *              × facteur_ancienneté (0,25 les 24 premières heures d'un wallet)
 *              / prises_attendues_du_jour
 *
 * `prises_attendues_du_jour` est une moyenne glissante sur 7 jours, jamais une prédiction.
 * Ordre de grandeur : 200 $/jour, ~400 prises → ~0,50 $ par prise. C'est petit, et c'est la principale
 * défense anti-triche. Ne jamais augmenter pour doper l'acquisition.
 */

export const HUNT_FACTOR_IN = 1.0;
export const HUNT_FACTOR_OUT = 0.3;
export const NEW_WALLET_FACTOR = 0.25;
export const NEW_WALLET_WINDOW_MS = 24 * 3600 * 1000;
export const MIN_EXPECTED_PRISES = 50; // au lancement, avant d'avoir 7 jours d'historique

export interface FragmentInput {
  dailyBudgetUsd: number;
  rarity: number; // 0.4 – 8.0
  inHunt: boolean;
  walletAgeMs: number;
  expectedPrisesToday: number;
  /** ×0,5 au-delà de 60 de risque, ×(1 − pénalité arrière-plan) … */
  extraFactor?: number;
}

export function huntFactor(inHunt: boolean): number {
  return inHunt ? HUNT_FACTOR_IN : HUNT_FACTOR_OUT;
}

export function ageFactor(walletAgeMs: number): number {
  return walletAgeMs < NEW_WALLET_WINDOW_MS ? NEW_WALLET_FACTOR : 1;
}

export function fragmentUsd(i: FragmentInput): number {
  const expected = Math.max(MIN_EXPECTED_PRISES, i.expectedPrisesToday);
  const usd = (i.dailyBudgetUsd * i.rarity * huntFactor(i.inHunt) * ageFactor(i.walletAgeMs) * (i.extraFactor ?? 1)) / expected;
  return Math.round(usd * 1e8) / 1e8;
}

/** Moyenne glissante sur 7 jours des prises validées. */
export function expectedPrises(last7DaysCounts: number[]): number {
  const days = last7DaysCounts.filter((n) => n >= 0);
  if (days.length === 0) return MIN_EXPECTED_PRISES;
  return days.reduce((a, b) => a + b, 0) / days.length;
}

/**
 * Conversion USD → montant de tokens (18 déc.) au prix Chainlink × currentMultiplier.
 * `priceUsd8` en 8 décimales, `multiplier18` en point fixe 18 (1e18 == ×1,00).
 */
export function usdToTokenAmount(usd: number, priceUsd8: bigint, multiplier18: bigint): bigint {
  if (priceUsd8 <= 0n || multiplier18 <= 0n) throw new Error("prix ou multiplicateur invalide");
  const usd8 = BigInt(Math.round(usd * 1e8));
  // amount = usd8 × 1e18 (token) × 1e18 (mult scale) / (price8 × mult18)
  return (usd8 * 10n ** 18n * 10n ** 18n) / (priceUsd8 * multiplier18);
}
