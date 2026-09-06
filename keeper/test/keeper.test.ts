import { describe, it, expect } from "vitest";
import { rawRarity, boundedStep, computeRarities, toChain } from "../src/rarity.js";
import { commitment, drawHunt, planHunts, dayIndex } from "../src/hunt.js";
import { planPurchase, budgetCycle, coverageHours, usdToTokens, tokensToUsd, minAmountOut, slippageBps } from "../src/inventory.js";

describe("rareté émergente", () => {
  it("formule de la spec, bornée à [0,4 ; 8,0]", () => {
    // 10 marques ; une marque qui fait 50 % des prises → 1/(0,5×10) = 0,2 → 0,4
    expect(rawRarity(50, 100, 10)).toBe(0.4);
    // 10 % des prises → 1,0
    expect(rawRarity(10, 100, 10)).toBe(1);
    // 1 % → 10 → plafond 8
    expect(rawRarity(1, 100, 10)).toBe(8);
    expect(rawRarity(0, 100, 10)).toBe(8);
    expect(rawRarity(0, 0, 10)).toBe(8);
  });
  it("±35 % par nuit", () => {
    expect(boundedStep(1, 8)).toBe(1.35);
    expect(boundedStep(1, 0.4)).toBeCloseTo(0.65, 10);
    expect(boundedStep(1, 1.2)).toBe(1.2);
    expect(boundedStep(7, 9)).toBe(8);
  });
  it("calcul groupé", () => {
    const r = computeRarities([
      { brandId: 1, prises7d: 900, current: 1 },
      { brandId: 2, prises7d: 100, current: 1 },
      { brandId: 3, prises7d: 0, current: 2 },
    ]);
    expect(r[0]?.target).toBe(0.4); // 1/(0,9×3) = 0,37 → plancher 0,4
    expect(r[0]?.applied).toBeCloseTo(0.65, 6);
    expect(r[1]?.target).toBeCloseTo(1 / (0.1 * 3), 6);
    expect(r[1]?.applied).toBe(1.35);
    expect(r[2]?.applied).toBe(2.7);
    expect(toChain(1.35)).toBe(1350);
  });
});

describe("chasse", () => {
  it("engagement identique au vecteur des contrats", () => {
    expect(commitment(20_702, [1, 2, 3, 4, 5], "0x4444444444444444444444444444444444444444444444444444444444444444")).toBe(
      "0x643792a6c0fb080dd971cc7d5567b3a7e18542eb448746782febf406ba3e4a2e",
    );
  });
  it("tirage : cinq marques distinctes, pondéré à l'inverse des sélections récentes", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const counts = new Map<number, number>();
    for (let i = 0; i < 2000; i++) {
      const h = drawHunt(ids, new Map([[1, 20]]), rnd);
      expect(new Set(h).size).toBe(5);
      for (const id of h) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    // la marque 1, très sélectionnée récemment, sort nettement moins
    expect((counts.get(1) ?? 0) * 3).toBeLessThan(counts.get(2) ?? 0);
    expect(() => drawHunt([1, 2, 3], new Map())).toThrow();
  });
  it("planification de 30 jours, engagements cohérents", () => {
    const plan = planHunts(20_702, 30, [1, 2, 3, 4, 5, 6, 7, 8], new Map());
    expect(plan).toHaveLength(30);
    expect(plan[0]?.day).toBe(20_702);
    expect(plan[29]?.day).toBe(20_731);
    for (const p of plan) expect(commitment(p.day, p.brandIds, p.salt)).toBe(p.commitment);
    expect(dayIndex(Date.UTC(2026, 8, 5, 12))).toBe(20_701);
  });
});

describe("inventaire", () => {
  const price = { priceUsd8: 230n * 10n ** 8n, multiplier18: 10n ** 18n };
  it("conversions avec multiplicateur", () => {
    expect(usdToTokens(0.5, price.priceUsd8, price.multiplier18)).toBe((5n * 10n ** 35n) / (230n * 10n ** 8n) / 10n ** 10n);
    expect(tokensToUsd(10n ** 18n, price.priceUsd8, 2n * 10n ** 18n)).toBe(460);
    expect(coverageHours(10n ** 18n, 10n ** 18n)).toBe(24);
    expect(coverageHours(10n ** 18n, 0n)).toBe(Infinity);
  });
  it("achète quand les unités ou la couverture manquent", () => {
    const policy = { minUnits: 200, minCoverageHours: 4, unitUsd: 0.5, targetUnits: 400 };
    const unit = usdToTokens(0.5, price.priceUsd8, price.multiplier18);
    expect(planPurchase({ brandId: 1, units: 300, totalTokens: unit * 300n, consumedLast24hTokens: unit * 100n, ...price }, policy)).toBeNull();
    const low = planPurchase({ brandId: 1, units: 50, totalTokens: unit * 50n, consumedLast24hTokens: 0n, ...price }, policy);
    expect(low?.reason).toBe("unités");
    expect(low?.unitsToBuy).toBe(350);
    // 300 unités mais consommation de 2 400/jour → couverture 3 h < 4 h
    const cover = planPurchase({ brandId: 1, units: 300, totalTokens: unit * 300n, consumedLast24hTokens: unit * 2400n, ...price }, policy);
    expect(cover?.reason).toBe("couverture");
    expect(cover?.unitsToBuy).toBe(600 - 300); // 4 h × 1,5 = 6 h de conso = 600 unités
  });
  it("jamais plus de 80 % du solde ETH, lots de 5", () => {
    const plans = Array.from({ length: 7 }, (_, i) => ({ brandId: i + 1, unitsToBuy: 100, unitTokens: 10n ** 15n, tokensToBuy: 10n ** 17n, usdToSpend: 50, reason: "unités" as const }));
    const ok = budgetCycle(plans, 10n ** 18n, 2000, 8000, 5); // 5 × 50 $ = 250 $ = 0,125 ETH < 0,8 ETH
    expect(ok.plans).toHaveLength(5);
    expect(ok.reduced).toBe(false);
    const tight = budgetCycle(plans, 10n ** 17n, 2000, 8000, 5); // 0,1 ETH : max 0,08 ETH = 160 $ pour 250 $ demandés
    expect(tight.reduced).toBe(true);
    expect(tight.plans.every((p) => p.unitsToBuy === 64)).toBe(true);
    expect(tight.ethWeiTotal).toBe(8n * 10n ** 16n);
  });
  it("tolérance de slippage 1 %", () => {
    expect(minAmountOut(10_000n, 100)).toBe(9_900n);
    expect(slippageBps(10_000n, 9_850n)).toBe(150);
  });
});
