/**
 * Inventaire — toutes les 5 minutes (spec 6.1), idempotent.
 *
 *   1. Pour chaque marque active, lire inventory.length et le total
 *   2. Si < 200 unités OU < 4 h de couverture au rythme des 24 dernières heures :
 *      a. lire le prix Chainlink (+ appliquer currentMultiplier)
 *      b. calculer le nombre d'unités à acheter
 *      c. swapper par lots de 5 marques maximum
 *      d. depositUnits() avec les montants réellement reçus (fait par SpotSwapper)
 *   3. Logger : prix attendu, prix obtenu, slippage
 *
 * Garde-fou : jamais plus de 80 % du solde ETH en un cycle. Si le calcul demande plus, réduire et alerter.
 */

export interface BrandInventory {
  brandId: number;
  units: number;
  totalTokens: bigint; // 18 déc.
  consumedLast24hTokens: bigint;
  priceUsd8: bigint;
  multiplier18: bigint;
}

export interface PurchasePlan {
  brandId: number;
  unitsToBuy: number;
  unitTokens: bigint;
  tokensToBuy: bigint;
  usdToSpend: number;
  reason: "unités" | "couverture";
}

export interface InventoryPolicy {
  minUnits: number;
  minCoverageHours: number;
  unitUsd: number;
  targetUnits: number; // on remonte à ce niveau quand on achète
}

/** Valeur USD d'un montant de tokens 18 déc. au prix Chainlink × multiplicateur. */
export function tokensToUsd(tokens: bigint, priceUsd8: bigint, multiplier18: bigint): number {
  return Number((tokens * priceUsd8 * multiplier18) / 10n ** 36n) / 1e8;
}

export function usdToTokens(usd: number, priceUsd8: bigint, multiplier18: bigint): bigint {
  const usd8 = BigInt(Math.round(usd * 1e8));
  return (usd8 * 10n ** 36n) / (priceUsd8 * multiplier18);
}

export function coverageHours(totalTokens: bigint, consumedLast24h: bigint): number {
  if (consumedLast24h === 0n) return Infinity;
  return (Number(totalTokens) / Number(consumedLast24h)) * 24;
}

export function planPurchase(b: BrandInventory, p: InventoryPolicy): PurchasePlan | null {
  const cover = coverageHours(b.totalTokens, b.consumedLast24hTokens);
  const lowUnits = b.units < p.minUnits;
  const lowCover = cover < p.minCoverageHours;
  if (!lowUnits && !lowCover) return null;
  const unitTokens = usdToTokens(p.unitUsd, b.priceUsd8, b.multiplier18);
  // objectif : au moins targetUnits, et au moins minCoverageHours × 1,5 de consommation
  const forCoverage = b.consumedLast24hTokens === 0n ? 0 : Math.ceil((Number(b.consumedLast24hTokens) * (p.minCoverageHours * 1.5)) / 24 / Number(unitTokens));
  const wanted = Math.max(p.targetUnits, forCoverage);
  const unitsToBuy = Math.max(0, wanted - b.units);
  if (unitsToBuy === 0) return null;
  const tokensToBuy = unitTokens * BigInt(unitsToBuy);
  return { brandId: b.brandId, unitsToBuy, unitTokens, tokensToBuy, usdToSpend: tokensToUsd(tokensToBuy, b.priceUsd8, b.multiplier18), reason: lowUnits ? "unités" : "couverture" };
}

/** Répartit le budget ETH du cycle : lots de `maxPerBatch` marques, 80 % du solde au plus. */
export function budgetCycle(plans: PurchasePlan[], ethBalanceWei: bigint, ethUsd: number, maxShareBps: number, maxPerBatch: number): { plans: PurchasePlan[]; reduced: boolean; ethWeiTotal: bigint } {
  const maxWei = (ethBalanceWei * BigInt(maxShareBps)) / 10_000n;
  const wanted = plans.slice(0, maxPerBatch);
  const usdTotal = wanted.reduce((s, p) => s + p.usdToSpend, 0);
  const weiTotal = usdToWei(usdTotal, ethUsd);
  if (weiTotal <= maxWei) return { plans: wanted, reduced: false, ethWeiTotal: weiTotal };
  // réduire proportionnellement
  const ratio = Number(maxWei) / Number(weiTotal);
  const reducedPlans = wanted
    .map((p) => {
      const units = Math.floor(p.unitsToBuy * ratio);
      return { ...p, unitsToBuy: units, tokensToBuy: p.unitTokens * BigInt(units), usdToSpend: p.usdToSpend * ratio };
    })
    .filter((p) => p.unitsToBuy > 0);
  return { plans: reducedPlans, reduced: true, ethWeiTotal: maxWei };
}

export function usdToWei(usd: number, ethUsd: number): bigint {
  if (ethUsd <= 0) throw new Error("prix ETH invalide");
  return BigInt(Math.round((usd / ethUsd) * 1e18));
}

export function minAmountOut(expectedTokens: bigint, slippageBps: number): bigint {
  return (expectedTokens * BigInt(10_000 - slippageBps)) / 10_000n;
}

export function slippageBps(expected: bigint, received: bigint): number {
  if (expected === 0n) return 0;
  return Number(((expected - received) * 10_000n) / expected);
}
