import { describe, it, expect } from "vitest";
import { nextRisk, decayed, intervalRegularity, counterAngleRate, fragmentsAllowed, rarityFactorForRisk, WEIGHTS, type RiskSignals } from "../src/risk/score.js";
import { Quotas, DAILY_PRISES } from "../src/risk/quotas.js";
import { MemoryKv } from "../src/infra/kv.js";
import { fragmentUsd, usdToTokenAmount, expectedPrises, ageFactor } from "../src/claim/fragment.js";
import { secondsUntilReset, dayIndex } from "../src/claim/hunt.js";

const clean: RiskSignals = {
  walletAgeMs: 10 * 24 * 3600 * 1000,
  walletsOnDevice24h: 1,
  walletsOnIp24h: 1,
  previousCountry: "FR",
  previousSeenAt: new Date("2026-09-05T10:00:00Z"),
  currentCountry: "FR",
  recentIntervalsMs: [25 * 60_000, 61 * 60_000, 180 * 60_000],
  counterAngleFailed: false,
  layer3Rejected: false,
  recentMinutesOfDay: [610, 1005, 1300],
  currentMinuteOfDay: 720,
};
const now = new Date("2026-09-05T12:00:00Z");

describe("score de risque", () => {
  it("compte propre : delta nul", () => {
    expect(nextRisk(0, now, clean, now)).toEqual({ risk: 0, reasons: [] });
  });
  it("applique les poids de la spec", () => {
    const bad: RiskSignals = {
      ...clean,
      walletAgeMs: 1000,
      walletsOnDevice24h: 3,
      walletsOnIp24h: 7,
      previousCountry: "DE",
      previousSeenAt: new Date(now.getTime() - 30 * 60_000),
      recentIntervalsMs: [1200_000, 1201_000, 1199_000, 1200_500],
      counterAngleFailed: true,
      layer3Rejected: true,
      recentMinutesOfDay: [720, 720, 720],
    };
    const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(185);
    expect(nextRisk(0, now, bad, now).risk).toBe(100); // plafonné
    expect(nextRisk(0, now, bad, now).reasons).toHaveLength(8);
  });
  it("décroît de 5 par jour", () => {
    expect(decayed(50, new Date(now.getTime() - 3 * 86400_000), now)).toBe(35);
    expect(decayed(3, new Date(now.getTime() - 3 * 86400_000), now)).toBe(0);
    expect(decayed(50, null, now)).toBe(50);
  });
  it("régularité des intervalles", () => {
    expect(intervalRegularity([1200_000, 1201_000, 1199_000])).toBeLessThan(0.08);
    expect(intervalRegularity([1200_000, 3_600_000, 400_000])).toBeGreaterThan(0.08);
    expect(intervalRegularity([1])).toBe(Infinity);
  });
  it("seuils 60 et 85", () => {
    expect(counterAngleRate(10, 0.08, 0.4)).toBe(0.08);
    expect(counterAngleRate(50, 0.08, 0.4)).toBe(0.4);
    expect(counterAngleRate(61, 0.08, 0.4)).toBe(1);
    expect(rarityFactorForRisk(61)).toBe(0.5);
    expect(fragmentsAllowed(85)).toBe(true);
    expect(fragmentsAllowed(86)).toBe(false);
  });
});

describe("quotas", () => {
  const t0 = Date.UTC(2026, 8, 5, 12, 0, 0);
  function make() {
    let t = t0;
    const kv = new MemoryKv(() => t);
    const q = new Quotas(kv, () => t);
    return { q, advance: (ms: number) => (t += ms) };
  }
  const sub = { wallet: "0xAbC", brandId: 1, deviceFingerprint: "dev1", ip: "1.2.3.4", subscriber: false };

  it("4 prises par jour, 20 min entre deux, 1 par marque", async () => {
    const { q, advance } = make();
    expect(await q.check(sub)).toEqual({ ok: true });
    await q.consume(sub);
    expect((await q.check({ ...sub, brandId: 2 })).ok).toBe(false); // 20 min
    advance(21 * 60_000);
    expect(await q.check(sub)).toEqual({ ok: false, reason: "marque déjà consignée aujourd'hui" });
    for (let b = 2; b <= DAILY_PRISES; b++) {
      expect(await q.check({ ...sub, brandId: b })).toEqual({ ok: true });
      await q.consume({ ...sub, brandId: b });
      advance(21 * 60_000);
    }
    expect(await q.check({ ...sub, brandId: 9 })).toEqual({ ok: false, reason: "prises du jour épuisées" });
    expect(await q.check({ ...sub, brandId: 9, subscriber: true })).toEqual({ ok: true }); // abonné : illimité
    advance(24 * 3600_000);
    expect(await q.check({ ...sub, brandId: 9 })).toEqual({ ok: true }); // lendemain
  });

  it("un rejet ne consomme rien", async () => {
    const { q } = make();
    expect(await q.check(sub)).toEqual({ ok: true });
    expect(await q.check(sub)).toEqual({ ok: true });
    expect(await q.prisesToday(sub.wallet)).toBe(0);
  });

  it("2 wallets par appareil, 6 par IP", async () => {
    const { q, advance } = make();
    for (const w of ["0x1", "0x2"]) {
      expect((await q.check({ ...sub, wallet: w })).ok).toBe(true);
      await q.consume({ ...sub, wallet: w });
      advance(21 * 60_000);
    }
    expect(await q.check({ ...sub, wallet: "0x3" })).toEqual({ ok: false, reason: "trop de wallets sur cet appareil" });
    expect((await q.check({ ...sub, wallet: "0x1", brandId: 5 })).ok).toBe(true); // déjà connu
    for (let i = 3; i <= 6; i++) {
      await q.consume({ ...sub, wallet: `0x${i}`, deviceFingerprint: `d${i}` });
    }
    expect(await q.check({ ...sub, wallet: "0x7", deviceFingerprint: "d7" })).toEqual({ ok: false, reason: "trop de wallets sur cette adresse" });
    expect(await q.walletsOnIp(sub.ip)).toBe(6);
  });
});

describe("fragment", () => {
  it("ordre de grandeur : 200 $ / 400 prises ≈ 0,50 $", () => {
    expect(fragmentUsd({ dailyBudgetUsd: 200, rarity: 1, inHunt: true, walletAgeMs: 1e9, expectedPrisesToday: 400 })).toBe(0.5);
    expect(fragmentUsd({ dailyBudgetUsd: 200, rarity: 1, inHunt: false, walletAgeMs: 1e9, expectedPrisesToday: 400 })).toBe(0.15);
    expect(fragmentUsd({ dailyBudgetUsd: 200, rarity: 8, inHunt: true, walletAgeMs: 1e9, expectedPrisesToday: 400 })).toBe(4);
    expect(fragmentUsd({ dailyBudgetUsd: 200, rarity: 0.4, inHunt: true, walletAgeMs: 1e9, expectedPrisesToday: 400 })).toBe(0.2);
    expect(fragmentUsd({ dailyBudgetUsd: 200, rarity: 1, inHunt: true, walletAgeMs: 1000, expectedPrisesToday: 400 })).toBe(0.125);
    expect(ageFactor(25 * 3600 * 1000)).toBe(1);
  });
  it("prises attendues : moyenne glissante, plancher", () => {
    expect(expectedPrises([300, 400, 500])).toBe(400);
    expect(expectedPrises([])).toBe(50);
    expect(fragmentUsd({ dailyBudgetUsd: 200, rarity: 1, inHunt: true, walletAgeMs: 1e9, expectedPrisesToday: 3 })).toBe(4); // plancher 50
  });
  it("USD → tokens avec multiplicateur", () => {
    // 0,483 $ à 230 $ ×1,00 → 0,0021 AMZN
    expect(usdToTokenAmount(0.483, 230n * 10n ** 8n, 10n ** 18n)).toBe(2_100_000_000_000_000n);
    // ×2,00 : deux fois moins de tokens pour la même valeur
    expect(usdToTokenAmount(0.483, 230n * 10n ** 8n, 2n * 10n ** 18n)).toBe(1_050_000_000_000_000n);
    expect(() => usdToTokenAmount(1, 0n, 10n ** 18n)).toThrow();
  });
  it("réarmement à 00:00 UTC", () => {
    const t = Date.UTC(2026, 8, 5, 14, 48, 0);
    expect(secondsUntilReset(t)).toBe(9 * 3600 + 12 * 60);
    expect(dayIndex(t)).toBe(20701);
  });
});
