import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { getAddress, type Address } from "viem";
import { PriseService, type PriseDeps } from "../src/claim/orchestrate.js";
import { MemoryRepos } from "../src/db/repos.js";
import { MemoryKv } from "../src/infra/kv.js";
import { Quotas } from "../src/risk/quotas.js";
import { FakeChainReader } from "../src/chain/client.js";
import { MemoryReferenceCorpus, type Embedder } from "../src/vision/clip.js";
import { NullEscalator, type Escalator } from "../src/vision/escalate.js";
import { NullDetector } from "../src/media/detect.js";
import { MemoryObjectStore } from "../src/media/storage.js";
import { LocalDevSigner } from "../src/voucher/signer.js";
import { NonceSource, spotDomain, verifyVoucher } from "../src/voucher/sign.js";
import type { PriseInput, SensorSample } from "../src/domain/types.js";
import { texture, warp, addNoise, toPng, seeded } from "./synthetic.js";

const W = 640;
const H = 480;
const ALICE = getAddress("0x1111111111111111111111111111111111111111");
const BOB = getAddress("0x2222222222222222222222222222222222222222");
const AMZN_TOKEN = getAddress("0x3333333333333333333333333333333333333333");
const AMZN_FEED = getAddress("0x4444444444444444444444444444444444444444");

/** Embedder factice : une image « Amazon » a un vecteur proche de la référence, une autre non. */
class FakeEmbedder implements Embedder {
  constructor(private readonly table: Map<string, number[]>) {}
  async embed(image: Buffer): Promise<Float32Array> {
    const key = createHash("sha256").update(image).digest("hex");
    return new Float32Array(this.table.get(key) ?? [0, 0, 1]);
  }
}

function sensors(seed = 3): SensorSample[] {
  const rnd = seeded(seed);
  return Array.from({ length: 45 }, (_, i) => ({ t: i * 33, ax: 0.03 * (rnd() - 0.5), ay: 0.03 * (rnd() - 0.5), az: 9.81 + 0.05 * (rnd() - 0.5), gx: 0.02 * (rnd() - 0.5), gy: 0.02 * (rnd() - 0.5), gz: 0.02 * (rnd() - 0.5) }));
}

/** Deux frames avec parallaxe réelle (objet central bouge plus que le fond). */
async function realFrames(seed: number): Promise<[Buffer, Buffer]> {
  const base = texture(W, H, seed, 5);
  const moved = warp(base, W, H, (x) => (x > W / 3 && x < (2 * W) / 3 ? [5, 2] : [1, 0]));
  return [await toPng(base, W, H), await toPng(addNoise(moved, 2, seed + 1), W, H)];
}

async function flatFrames(seed: number): Promise<[Buffer, Buffer]> {
  const base = texture(W, H, seed, 5);
  return [await toPng(base, W, H), await toPng(addNoise(warp(base, W, H, () => [2, 1]), 2, seed + 1), W, H)];
}

describe("orchestration d'une prise", () => {
  let repos: MemoryRepos;
  let chain: FakeChainReader;
  let store: MemoryObjectStore;
  let service: PriseService;
  let rngValue: number;
  let now: number;
  let embedTable: Map<string, number[]>;
  let escalator: Escalator;
  let fragmentsEnabled: boolean;
  const signer = new LocalDevSigner("0x00000000000000000000000000000000000000000000000000000000000a11ce");
  const domain = spotDomain(4663, "0x9999999999999999999999999999999999999999");

  function input(wallet: Address, frames: [Buffer, Buffer], over: Partial<PriseInput> = {}): PriseInput {
    return {
      wallet,
      brandId: 1,
      frameA: frames[0],
      frameB: frames[1],
      sensors: sensors(),
      clientTimestampMs: now,
      deviceFingerprint: "appareil-1",
      ip: "10.0.0.1",
      country: "FR",
      cityCode: 69_000,
      cityLabel: "Lyon, FR",
      ...over,
    };
  }

  async function amazonFrames(seed: number, real = true): Promise<[Buffer, Buffer]> {
    const frames = real ? await realFrames(seed) : await flatFrames(seed);
    embedTable.set(createHash("sha256").update(frames[0]).digest("hex"), [1, 0, 0]);
    return frames;
  }

  beforeEach(async () => {
    repos = new MemoryRepos();
    chain = new FakeChainReader();
    store = new MemoryObjectStore();
    embedTable = new Map();
    escalator = new NullEscalator();
    rngValue = 0.5;
    fragmentsEnabled = true;
    now = Date.UTC(2026, 8, 5, 14, 0, 0);
    await repos.brands.upsert({ id: 1, name: "Amazon", symbol: "AMZN", token: AMZN_TOKEN, priceFeed: AMZN_FEED, sector: 1, active: true, rarity: 1 });
    await repos.brands.upsert({ id: 2, name: "Coca-Cola", symbol: "KO", token: getAddress("0x5555555555555555555555555555555555555555"), priceFeed: AMZN_FEED, sector: 2, active: true, rarity: 2 });
    chain.prices.set(AMZN_FEED.toLowerCase(), { priceUsd8: 230n * 10n ** 8n, multiplier18: 10n ** 18n, updatedAt: now / 1000 });
    chain.hunt = [1];
    const deps: PriseDeps = {
      repos,
      quotas: new Quotas(new MemoryKv(() => now), () => now),
      chain,
      embedder: new FakeEmbedder(embedTable),
      corpus: new MemoryReferenceCorpus(new Map([[1, [[1, 0, 0], [0.98, 0.1, 0]]], [2, [[1, 0, 0], [0.99, 0.1, 0], [0.98, 0.05, 0], [0, 1, 0]]]])),
      get escalator() {
        return escalator;
      },
      faces: new NullDetector(),
      plates: new NullDetector(),
      store,
      signer,
      domain,
      nonces: new NonceSource(),
      get config() {
        return { dailyBudgetUsd: 200, counterAngleRate: 0.08, counterAngleRateHighRisk: 0.4, voucherLifetimeS: 1800, fragmentsEnabled };
      },
      now: () => now,
      rng: () => rngValue,
      log: { info: () => undefined, warn: () => undefined },
    };
    service = new PriseService(deps);
  });

  it("valide : voucher signé, fiche enregistrée, image traitée stockée, quota consommé", async () => {
    // wallet créé il y a plus de 24 h pour toucher le plein tarif
    const a = await repos.accounts.ensure(ALICE, new Date(now - 3 * 86400_000));
    a.firstSeen = new Date(now - 3 * 86400_000);
    const out = await service.handlePrise(input(ALICE, await amazonFrames(1)));
    expect(out.kind).toBe("valide");
    if (out.kind !== "valide") return;
    expect(out.paid).toBe(true);
    expect(out.inHunt).toBe(true);
    expect(out.usdValue).toBe(4); // 200 × 1 × 1 / 50 (plancher) = 4 $
    expect(out.voucher.amount).toBe((4n * 10n ** 18n * 10n ** 8n) / (230n * 10n ** 8n)); // 4 $ en AMZN
    expect(out.voucher.token).toBe(AMZN_TOKEN);
    expect(out.voucher.cityCode).toBe(69_000);
    expect(out.voucher.deadline - out.voucher.issuedAt).toBe(1800n);
    expect(await verifyVoucher(domain, out.voucher, out.signature, signer.address)).toBe(true);
    expect(store.objects.has(out.imageKey)).toBe(true);
    expect(out.imageHash).toMatch(/^0x[0-9a-f]{64}$/);
    const fiches = await repos.sightings.byWallet(ALICE, 10, 0);
    expect(fiches).toHaveLength(1);
    expect(fiches[0]?.nonce).toBe(out.voucher.nonce);
    // le même wallet ne peut pas refaire la même marque aujourd'hui
    const again = await service.handlePrise(input(ALICE, await amazonFrames(2)));
    expect(again).toMatchObject({ kind: "rejet", motif: "quota atteint" });
  });

  it("nouveau wallet : 25 % du tarif ; hors chasse : 30 %", async () => {
    const out = await service.handlePrise(input(ALICE, await amazonFrames(3)));
    expect(out.kind === "valide" && out.usdValue).toBe(1); // 4 × 0,25
    chain.hunt = [2];
    now += 21 * 60_000;
    const out2 = await service.handlePrise(input(BOB, await amazonFrames(4), { deviceFingerprint: "appareil-2", ip: "10.0.0.2" }));
    expect(out2.kind === "valide" && out2.usdValue).toBe(0.3); // 4 × 0,25 × 0,3
  });

  it("budget épuisé : fiche seule, paid=false, mais voucher quand même signé", async () => {
    chain.budget = { day: 20701, budgetUsd8: 200n * 10n ** 8n, spentUsd8: 200n * 10n ** 8n };
    const out = await service.handlePrise(input(ALICE, await amazonFrames(5)));
    expect(out.kind).toBe("valide");
    if (out.kind !== "valide") return;
    expect(out.paid).toBe(false);
    expect(out.usdValue).toBe(0);
    expect(out.voucher.amount).toBeGreaterThan(0n); // le contrat tranchera avec l'état réel du budget
    const stats = await repos.stats.get("2026-09-05");
    expect(stats?.sightingsOnly).toBe(1);
  });

  it("rejets : scène plane, objet non reconnu, quota non consommé", async () => {
    const flat = await amazonFrames(6, false);
    const r1 = await service.handlePrise(input(ALICE, flat));
    expect(r1).toMatchObject({ kind: "rejet", motif: "la scène semble plane" });
    expect((await repos.accounts.get(ALICE))?.risk).toBeGreaterThanOrEqual(25); // rejet couche 3 + wallet jeune

    const unknown = await realFrames(7); // pas dans la table → vecteur [0,0,1], similarité 0
    const r2 = await service.handlePrise(input(ALICE, unknown));
    expect(r2).toMatchObject({ kind: "rejet", motif: "objet non reconnu" });

    // aucun quota consommé : une vraie prise passe encore
    const ok = await service.handlePrise(input(ALICE, await amazonFrames(8)));
    expect(ok.kind).toBe("valide");
    expect((await repos.stats.get("2026-09-05"))?.rejects).toBe(2);
  });

  it("bande médiane : escalade, acceptée si le modèle confirme, refusée sinon", async () => {
    const frames = await realFrames(9);
    embedTable.set(createHash("sha256").update(frames[0]).digest("hex"), [0.6, 0.8, 0]); // ≈ 0,64 de similarité : bande médiane
    let asked = 0;
    escalator = { ask: async () => (asked++, { present: true, confiance: 0.9, motif: "camion de livraison" }) };
    const out = await service.handlePrise(input(ALICE, frames));
    expect(out.kind).toBe("valide");
    expect(asked).toBe(1);
    expect((await repos.stats.get("2026-09-05"))?.escalations).toBe(1);

    now += 21 * 60_000;
    escalator = { ask: async () => ({ present: false, confiance: 0.2, motif: "aucun objet de marque" }) };
    const frames2 = await realFrames(10);
    embedTable.set(createHash("sha256").update(frames2[0]).digest("hex"), [0.6, 0.8, 0]);
    const out2 = await service.handlePrise(input(ALICE, frames2, { brandId: 2 }));
    expect(out2).toMatchObject({ kind: "rejet", motif: "objet non reconnu", flags: ["escalade : aucun objet de marque"] });
  });

  it("unicité : même photo → déjà consignée ; photo d'un autre joueur → rejet et signalement des deux", async () => {
    const frames = await amazonFrames(11);
    await service.handlePrise(input(ALICE, frames));
    now += 21 * 60_000;
    const r = await service.handlePrise(input(ALICE, frames, { brandId: 2 }));
    expect(r).toMatchObject({ kind: "rejet", motif: "déjà consignée" });
    const r2 = await service.handlePrise(input(BOB, frames, { deviceFingerprint: "appareil-2", ip: "10.0.0.2" }));
    expect(r2).toMatchObject({ kind: "rejet", motif: "déjà consignée par quelqu'un d'autre" });
    expect((await repos.accounts.get(BOB))?.risk).toBeGreaterThanOrEqual(25);
    expect((await repos.accounts.get(ALICE))?.risk).toBeGreaterThanOrEqual(25);
  });

  it("contre-angle : demandé, réussi sous un autre angle, refusé si trop proche ou hors délai", async () => {
    rngValue = 0.01; // < 8 %
    const frames = await amazonFrames(12);
    const ask = await service.handlePrise(input(ALICE, frames));
    expect(ask.kind).toBe("contre-angle");
    if (ask.kind !== "contre-angle") return;
    expect(ask.deadlineMs).toBe(now + 60_000);
    expect(await repos.sightings.byWallet(ALICE, 10, 0)).toHaveLength(0);

    // trop proche : la même image
    now += 10_000;
    const tooClose = await service.handleCounterAngle({ priseId: ask.priseId, wallet: ALICE, image: frames[0], deviceFingerprint: "appareil-1", ip: "10.0.0.1", cityLabel: "Lyon, FR" });
    expect(tooClose).toMatchObject({ kind: "rejet", motif: "contre-angle trop proche" });
    expect((await repos.accounts.get(ALICE))?.risk).toBeGreaterThanOrEqual(30);

    // un nouveau cycle le lendemain, réussi : un pas de côté = grand déplacement non uniforme
    now += 24 * 3600_000;
    const frames3 = await amazonFrames(14);
    const ask3 = await service.handlePrise(input(ALICE, frames3));
    expect(ask3.kind).toBe("contre-angle");
    if (ask3.kind !== "contre-angle") return;
    const base = texture(W, H, 14, 5);
    const side = await toPng(addNoise(warp(base, W, H, (x) => (x > W / 3 && x < (2 * W) / 3 ? [12, 4] : [5, 1])), 3, 99), W, H);
    embedTable.set(createHash("sha256").update(side).digest("hex"), [0.95, 0.2, 0]);
    now += 30_000;
    const ok = await service.handleCounterAngle({ priseId: ask3.priseId, wallet: ALICE, image: side, deviceFingerprint: "appareil-1", ip: "10.0.0.1", cityLabel: "Lyon, FR" });
    expect(ok.kind).toBe("valide");

    // hors délai
    now += 21 * 60_000;
    const frames4 = await amazonFrames(15);
    const ask4 = await service.handlePrise(input(ALICE, frames4, { brandId: 1 }));
    expect(ask4).toMatchObject({ kind: "rejet", motif: "quota atteint" }); // déjà consignée aujourd'hui
    now += 24 * 3600_000;
    const ask5 = await service.handlePrise(input(ALICE, await amazonFrames(16)));
    expect(ask5.kind).toBe("contre-angle");
    if (ask5.kind !== "contre-angle") return;
    now += 61_000;
    const late = await service.handleCounterAngle({ priseId: ask5.priseId, wallet: ALICE, image: side, deviceFingerprint: "appareil-1", ip: "10.0.0.1", cityLabel: "Lyon, FR" });
    expect(late).toMatchObject({ kind: "rejet", motif: "contre-angle hors délai" });
  });

  it("réémission : refusée tant que le voucher est valide ou déjà réclamé, sinon nouveau nonce", async () => {
    const out = await service.handlePrise(input(ALICE, await amazonFrames(17)));
    if (out.kind !== "valide") throw new Error("attendu valide");
    expect(await service.reissueVoucher(out.priseId, ALICE)).toEqual({ error: "voucher encore valide" });
    expect(await service.reissueVoucher(out.priseId, BOB)).toEqual({ error: "prise introuvable" });
    now += 31 * 60_000;
    const re = await service.reissueVoucher(out.priseId, ALICE);
    if ("error" in re) throw new Error(re.error);
    expect(re.voucher.nonce).not.toBe(out.voucher.nonce);
    expect(re.voucher.imageHash).toBe(out.voucher.imageHash);
    expect(re.voucher.amount).toBe(out.voucher.amount);
    expect(await verifyVoucher(domain, re.voucher, re.signature, signer.address)).toBe(true);
    chain.usedNonces.add(re.voucher.nonce);
    now += 31 * 60_000;
    expect(await service.reissueVoucher(out.priseId, ALICE)).toEqual({ error: "déjà réclamée" });
  });

  it("risque > 85 : montant nul, fiche seule, sans prévenir", async () => {
    const a = await repos.accounts.ensure(ALICE, new Date(now));
    a.risk = 90;
    await repos.accounts.update(a);
    const out = await service.handlePrise(input(ALICE, await amazonFrames(18)));
    // risque > 60 : contre-angle systématique
    expect(out.kind).toBe("contre-angle");
    rngValue = 0.99;
    now += 21 * 60_000;
    const out2 = await service.handlePrise(input(BOB, await amazonFrames(19), { deviceFingerprint: "appareil-2", ip: "10.0.0.2" }));
    expect(out2.kind).toBe("valide");
    const b = await repos.accounts.ensure(BOB, new Date(now));
    b.risk = 100;
    await repos.accounts.update(b);
    now += 24 * 3600_000;
    const out3 = await service.handlePrise(input(BOB, await amazonFrames(20), { deviceFingerprint: "appareil-2", ip: "10.0.0.2" }));
    expect(out3.kind).toBe("contre-angle"); // systématique au-delà de 60
    if (out3.kind !== "contre-angle") return;
    const base = texture(W, H, 20, 5);
    const side = await toPng(addNoise(warp(base, W, H, (x) => (x > W / 3 && x < (2 * W) / 3 ? [12, 4] : [5, 1])), 3, 98), W, H);
    embedTable.set(createHash("sha256").update(side).digest("hex"), [0.95, 0.2, 0]);
    now += 5_000;
    const fin = await service.handleCounterAngle({ priseId: out3.priseId, wallet: BOB, image: side, deviceFingerprint: "appareil-2", ip: "10.0.0.2", cityLabel: "Lyon, FR" });
    expect(fin.kind).toBe("valide");
    if (fin.kind !== "valide") return;
    expect(fin.voucher.amount).toBe(0n);
    expect(fin.paid).toBe(false);
  });

  it("suppression : l'image part réellement, la fiche disparaît du carnet", async () => {
    const out = await service.handlePrise(input(ALICE, await amazonFrames(21)));
    if (out.kind !== "valide") throw new Error("attendu valide");
    const [fiche] = await repos.sightings.byWallet(ALICE, 1, 0);
    expect(await service.deleteSighting(fiche!.id, BOB)).toBe(false);
    expect(await service.deleteSighting(fiche!.id, ALICE)).toBe(true);
    expect(store.objects.has(out.imageKey)).toBe(false);
    expect(await repos.sightings.byWallet(ALICE, 1, 0)).toHaveLength(0);
  });

  it("marque retirée : rejet en clair", async () => {
    await repos.brands.upsert({ id: 1, name: "Amazon", symbol: "AMZN", token: AMZN_TOKEN, priceFeed: AMZN_FEED, sector: 1, active: false, rarity: 1 });
    expect(await service.handlePrise(input(ALICE, await amazonFrames(22)))).toMatchObject({ kind: "rejet", motif: "marque retirée" });
  });

  it("région sans fragment : la fiche et l'épingle, pas de token", async () => {
    const a = await repos.accounts.ensure(ALICE, new Date(now - 3 * 86400_000));
    a.firstSeen = new Date(now - 3 * 86400_000);
    const out = await service.handlePrise(input(ALICE, await amazonFrames(1), { country: "US" }));
    expect(out.kind).toBe("valide");
    if (out.kind !== "valide") return;
    expect(out.regionRestricted).toBe(true);
    expect(out.paid).toBe(false);
    expect(out.usdValue).toBe(0);
    expect(out.voucher.amount).toBe(0n);
    const unknown = await service.handlePrise(input(BOB, await amazonFrames(2), { country: null }));
    expect(unknown.kind).toBe("valide");
    if (unknown.kind === "valide") expect(unknown.regionRestricted).toBe(true);
  });

  it("fragments en pause : la fiche est validée et consignée, mais vaut 0 fragment", async () => {
    fragmentsEnabled = false;
    const a = await repos.accounts.ensure(ALICE, new Date(now - 3 * 86400_000));
    a.firstSeen = new Date(now - 3 * 86400_000);
    const out = await service.handlePrise(input(ALICE, await amazonFrames(1)));
    expect(out.kind).toBe("valide");
    if (out.kind !== "valide") return;
    expect(out.fragmentsPaused).toBe(true);
    expect(out.regionRestricted).toBe(false);
    expect(out.paid).toBe(false);
    expect(out.usdValue).toBe(0);
    expect(out.voucher.amount).toBe(0n);
    expect(await verifyVoucher(domain, out.voucher, out.signature, signer.address)).toBe(true);
    expect(await repos.sightings.byWallet(ALICE, 10, 0)).toHaveLength(1);
    expect((await repos.stats.get("2026-09-05"))?.sightingsOnly).toBe(1);
    // le drapeau revient à la normale : le fragment est de nouveau versé
    fragmentsEnabled = true;
    now += 21 * 60_000;
    const back = await service.handlePrise(input(BOB, await amazonFrames(2), { deviceFingerprint: "appareil-2", ip: "10.0.0.2" }));
    expect(back.kind).toBe("valide");
    if (back.kind === "valide") {
      expect(back.fragmentsPaused).toBe(false);
      expect(back.paid).toBe(true);
    }
  });
});
