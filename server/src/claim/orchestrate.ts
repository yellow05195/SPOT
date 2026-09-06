import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Address, Hex, TypedDataDomain } from "viem";
import type { PriseInput, PriseOutcome, Voucher, PendingPrise, RejectMotif, Account } from "../domain/types.js";
import type { Repos } from "../db/repos.js";
import type { Quotas } from "../risk/quotas.js";
import type { ChainReader } from "../chain/client.js";
import type { Embedder, ReferenceCorpus } from "../vision/clip.js";
import { scoreAgainstRefs, decide, decideZeroShot, REJECT_THRESHOLD } from "../vision/clip.js";
import type { Escalator } from "../vision/escalate.js";
import { ESCALATION_ACCEPT_CONFIDENCE } from "../vision/escalate.js";
import type { Detector } from "../media/detect.js";
import type { ObjectStore } from "../media/storage.js";
import { imageKey } from "../media/storage.js";
import { processImage } from "../media/process.js";
import { mechanicalChecks } from "../checks/mechanical.js";
import { parallaxCheck, MIN_TEXTURED_BLOCKS } from "../vision/parallax.js";
import { moireCheck, TILE_FRACTION } from "../vision/moire.js";
import { fragmentsAllowedIn } from "./region.js";
import { borderCheck, luminanceCheck } from "../vision/frame.js";
import { phash, backgroundPhash, DUPLICATE_DISTANCE } from "../vision/phash.js";
import { nextRisk, counterAngleRate, rarityFactorForRisk, fragmentsAllowed, WEIGHTS, type RiskSignals } from "../risk/score.js";
import { fragmentUsd, expectedPrises, usdToTokenAmount } from "./fragment.js";
import { dayIndex, isInHunt } from "./hunt.js";
import { COUNTER_ANGLE_WINDOW_MS, viewpointChange, judgeCounterAngle } from "./counterAngle.js";
import { type VoucherSigner, NonceSource } from "../voucher/sign.js";

export interface PriseDeps {
  repos: Repos;
  quotas: Quotas;
  chain: ChainReader;
  embedder: Embedder;
  corpus: ReferenceCorpus;
  escalator: Escalator;
  faces: Detector;
  plates: Detector;
  store: ObjectStore;
  signer: VoucherSigner;
  domain: TypedDataDomain;
  nonces: NonceSource;
  config: { dailyBudgetUsd: number; counterAngleRate: number; counterAngleRateHighRisk: number; voucherLifetimeS: number; fragmentsEnabled: boolean };
  now: () => number;
  rng: () => number;
  log: { info: (o: object, msg: string) => void; warn: (o: object, msg: string) => void };
}

const BACKGROUND_REPEAT_LIMIT = 3;
const BACKGROUND_PENALTY = 0.5;
const SHARED_IMAGE_RISK = 25;

/**
 * L'orchestration d'une prise (spec Partie 4) : six couches, de la moins chère à la plus chère.
 * L'objectif n'est pas zéro triche — c'est que tricher coûte plus cher que 0,50 $.
 * Le rejet ne consomme jamais de quota. Une prise validée est validée pour toujours.
 */
export class PriseService {
  constructor(private readonly d: PriseDeps) {}

  private today(): string {
    return new Date(this.d.now()).toISOString().slice(0, 10);
  }

  private async reject(motif: RejectMotif, flags: string[]): Promise<PriseOutcome> {
    await this.d.repos.stats.bump(this.today(), "rejects", 1);
    return { kind: "rejet", motif, flags };
  }

  async handlePrise(input: PriseInput): Promise<PriseOutcome> {
    const now = this.d.now();
    const flags: string[] = [];
    await this.d.repos.stats.ensure(this.today(), this.d.config.dailyBudgetUsd);

    const brand = await this.d.repos.brands.get(input.brandId);
    if (!brand || !brand.active) return this.reject("marque retirée", flags);

    const account = await this.d.repos.accounts.ensure(input.wallet, new Date(now));

    // Quotas — vérifiés, pas consommés
    const quota = await this.d.quotas.check({ wallet: input.wallet, brandId: input.brandId, deviceFingerprint: input.deviceFingerprint, ip: input.ip, subscriber: account.subscriber });
    if (!quota.ok) return this.reject("quota atteint", [quota.reason]);

    // Couche 2 — mécanique
    const mech = await mechanicalChecks({ frameA: input.frameA, frameB: input.frameB, sensors: input.sensors, clientTimestampMs: input.clientTimestampMs, nowMs: now });
    flags.push(...mech.flags);
    if (mech.reject) return this.reject(mech.reject, flags);

    // Couche 3 — parallaxe, moiré, cadre, luminance
    const [parallax, moire, border, luminance] = await Promise.all([
      parallaxCheck(input.frameA, input.frameB),
      moireCheck(input.frameA),
      borderCheck(input.frameA),
      luminanceCheck(input.frameA),
    ]);
    if (luminance.suspicious) flags.push("luminance homogène");
    const layer3: RejectMotif | null = parallax.planar ? "la scène semble plane" : moire.detected ? "motif d'écran détecté" : border.detected ? "cadre d'écran détecté" : null;
    if (layer3) {
      await this.updateRisk(account, input, { layer3Rejected: true, counterAngleFailed: false });
      return this.reject(layer3, flags);
    }

    // Couche 4 — reconnaissance : CLIP local, puis escalade sur la bande médiane
    const embedding = await this.d.embedder.embed(input.frameA);
    const refs = await this.d.corpus.refs(brand.id);
    const score = scoreAgainstRefs(embedding, refs);
    const zeroShot = (await this.d.corpus.zeroShot?.(brand.id)) ?? false;
    let decision = zeroShot ? decideZeroShot(score, (await this.d.corpus.bestOtherScore?.(embedding, brand.id)) ?? -1) : decide(score);
    if (zeroShot) flags.push("références zero-shot");
    let escalated = false;
    // A clean CLIP match is not enough when layer 3 saw something odd (flat light, a hint of moiré, little texture):
    // a screen or a print filling part of the frame slips past the hard thresholds. Those go to the model too.
    const borderline = luminance.suspicious || moire.flaggedTiles >= Math.max(1, Math.ceil(moire.totalTiles * TILE_FRACTION * 0.5)) || parallax.texturedBlocks < MIN_TEXTURED_BLOCKS;
    const borderlineOnly = decision === "accept" && borderline;
    if (borderlineOnly) {
      decision = "escalate";
      flags.push("vérification renforcée");
    }
    let noFragment = false;
    if (decision === "escalate") {
      escalated = true;
      await this.d.repos.stats.bump(this.today(), "escalations", 1);
      const meta = await sharp(input.frameA).metadata();
      const mediaType = meta.format === "webp" ? "image/webp" : meta.format === "png" ? "image/png" : "image/jpeg";
      const answer = await this.d.escalator.ask(input.frameA, mediaType, brand.name, "objet, véhicule, enseigne ou produit");
      if (answer === null && borderlineOnly) {
        // the model is unreachable: keep the card on CLIP's word, but hand out no fragment
        decision = "accept";
        noFragment = true;
        flags.push("escalade indisponible : fiche seule");
      } else {
        decision = answer && answer.present && answer.confiance >= ESCALATION_ACCEPT_CONFIDENCE ? "accept" : "reject";
      }
      if (answer?.motif) flags.push(`escalade : ${answer.motif}`);
    }
    if (decision === "reject") return this.reject("objet non reconnu", flags);

    // Couche 5 — unicité
    const ph = await phash(input.frameA);
    const bg = await backgroundPhash(input.frameA);
    const near = await this.d.repos.sightings.nearestByPhash(ph, input.wallet, 3650, new Date(now));
    if (near.own && near.own.distance < DUPLICATE_DISTANCE) return this.reject("déjà consignée", flags);
    if (near.others && near.others.distance < DUPLICATE_DISTANCE) {
      await this.flagSharedImage(account, near.others.wallet);
      return this.reject("déjà consignée par quelqu'un d'autre", flags);
    }
    let extraFactor = 1;
    if ((await this.d.repos.sightings.backgroundRepeats(bg, input.wallet, 24, new Date(now))) >= BACKGROUND_REPEAT_LIMIT) {
      extraFactor *= BACKGROUND_PENALTY;
      flags.push("arrière-plan récurrent");
    }

    // Score de risque
    const risk = await this.updateRisk(account, input, { layer3Rejected: false, counterAngleFailed: false });
    extraFactor *= rarityFactorForRisk(risk);

    // Traitement d'image, en mémoire, puis stockage de la version traitée uniquement
    const processed = await processImage(input.frameA, this.d.faces, this.d.plates);
    const key = imageKey(input.wallet, processed.sha256);
    await this.d.store.put(key, processed.webp, "image/webp");

    // Valeur du fragment
    const day = dayIndex(now);
    const hunt = (await this.d.chain.huntToday(day)) ?? (await this.d.repos.hunts.today(this.today())) ?? [];
    const inHunt = isInHunt(hunt, brand.id);
    const rarity = brand.rarity;
    const expected = expectedPrises(await this.d.repos.sightings.countByDay(7, new Date(now)));
    const walletAgeMs = now - account.firstSeen.getTime();
    const regionOk = fragmentsAllowedIn(input.country);
    if (!regionOk) flags.push("fragment indisponible dans ce pays");
    // « fiches d'abord, fragments ensuite » : la prise est validée et consignée, mais vaut 0 fragment
    if (!this.d.config.fragmentsEnabled) {
      noFragment = true;
      flags.push("fragments en pause");
    }
    let usd = fragmentsAllowed(risk) && regionOk && !noFragment ? fragmentUsd({ dailyBudgetUsd: this.d.config.dailyBudgetUsd, rarity, inHunt, walletAgeMs, expectedPrisesToday: expected, extraFactor }) : 0;
    let tokenAmount = 0n;
    if (usd > 0) {
      const price = await this.d.chain.price(brand.priceFeed, brand.token);
      tokenAmount = usdToTokenAmount(usd, price.priceUsd8, price.multiplier18);
      if (tokenAmount === 0n) usd = 0;
    }

    const pending: PendingPrise = {
      id: randomUUID(),
      wallet: input.wallet,
      brandId: brand.id,
      sightingId: null,
      imageHash: processed.sha256,
      imageKey: key,
      phash: ph,
      cityCode: input.cityCode,
      usdValue: usd,
      tokenAmount,
      counterAngleDeadlineMs: null,
      counterAngleEmbedding: null,
      counterAnglePhash: null,
      createdAt: new Date(now),
      lastNonce: null,
    };

    // Couche 6 — contre-angle, aléatoirement (8 %, 40 % à risque élevé, systématique au-delà de 60)
    const rate = counterAngleRate(risk, this.d.config.counterAngleRate, this.d.config.counterAngleRateHighRisk);
    if (this.d.rng() < rate) {
      pending.counterAngleDeadlineMs = now + COUNTER_ANGLE_WINDOW_MS;
      pending.counterAngleEmbedding = Array.from(embedding);
      pending.counterAnglePhash = ph;
      await this.d.repos.pending.put(pending);
      this.d.log.info({ priseId: pending.id, wallet: input.wallet, risk }, "contre-angle demandé");
      return { kind: "contre-angle", priseId: pending.id, deadlineMs: pending.counterAngleDeadlineMs };
    }

    return this.issue(pending, { inHunt, rarity, score, escalated, risk, cityLabel: input.cityLabel, country: input.country, bgPhash: bg, deviceFingerprint: input.deviceFingerprint, ip: input.ip, subscriber: account.subscriber });
  }

  /** Signe le voucher, enregistre la fiche, consomme le quota. Appelé une fois par prise validée. */
  private async issue(
    p: PendingPrise,
    ctx: { inHunt: boolean; rarity: number; score: number; escalated: boolean; risk: number; cityLabel: string; country: string | null; bgPhash: Buffer | null; deviceFingerprint: string; ip: string; subscriber: boolean },
  ): Promise<PriseOutcome> {
    const now = this.d.now();
    const budget = await this.d.chain.budgetState();
    const usd8 = BigInt(Math.round(p.usdValue * 1e8));
    const paid = p.tokenAmount > 0n && budget.spentUsd8 + usd8 <= budget.budgetUsd8;

    const { voucher, signature } = await this.sign(p, now);
    const sighting = await this.d.repos.sightings.insert({
      wallet: p.wallet,
      brandId: p.brandId,
      createdAt: new Date(now),
      phash: p.phash,
      bgPhash: ctx.bgPhash,
      imageKey: p.imageKey,
      imageHash: p.imageHash,
      cityCode: p.cityCode,
      cityLabel: ctx.cityLabel,
      inHunt: ctx.inHunt,
      rarityAt: ctx.rarity,
      usdValue: paid ? p.usdValue : 0,
      paid,
      nonce: voucher.nonce,
      txClaim: null,
      visionScore: ctx.score,
      escalated: ctx.escalated,
      riskAt: ctx.risk,
    });
    p.sightingId = sighting.id;
    p.lastNonce = voucher.nonce;
    p.counterAngleDeadlineMs = null;
    p.counterAngleEmbedding = null;
    await this.d.repos.pending.put(p); // reçu de prise : permet la réémission sans nouvelle photo

    await this.d.quotas.consume({ wallet: p.wallet, brandId: p.brandId, deviceFingerprint: ctx.deviceFingerprint, ip: ctx.ip, subscriber: ctx.subscriber });
    await this.d.repos.stats.bump(this.today(), paid ? "claims" : "sightingsOnly", 1);
    if (paid) await this.d.repos.stats.bump(this.today(), "spentUsd", p.usdValue);

    return {
      kind: "valide",
      priseId: p.id,
      voucher,
      signature,
      usdValue: paid ? p.usdValue : 0,
      paid,
      regionRestricted: !fragmentsAllowedIn(ctx.country),
      fragmentsPaused: !this.d.config.fragmentsEnabled,
      inHunt: ctx.inHunt,
      rarity: ctx.rarity,
      imageKey: p.imageKey,
      imageHash: p.imageHash,
    };
  }

  private async sign(p: PendingPrise, nowMs: number): Promise<{ voucher: Voucher; signature: Hex }> {
    const brand = await this.d.repos.brands.get(p.brandId);
    if (!brand) throw new Error("marque introuvable");
    const nonce = await this.d.nonces.next(nowMs);
    const issuedAt = BigInt(Math.floor(nowMs / 1000));
    const voucher: Voucher = {
      wallet: p.wallet,
      brandId: p.brandId,
      amount: p.tokenAmount,
      token: brand.token,
      nonce,
      issuedAt,
      deadline: issuedAt + BigInt(this.d.config.voucherLifetimeS),
      imageHash: p.imageHash,
      cityCode: p.cityCode,
    };
    const signature = await this.d.signer.signVoucher(this.d.domain, voucher);
    return { voucher, signature };
  }

  /** Couche 6 : le second cliché, sous un autre angle, dans les 60 secondes. */
  async handleCounterAngle(input: { priseId: string; wallet: Address; image: Buffer; deviceFingerprint: string; ip: string; country: string | null; cityLabel: string }): Promise<PriseOutcome> {
    const now = this.d.now();
    const p = await this.d.repos.pending.get(input.priseId);
    if (!p || p.wallet.toLowerCase() !== input.wallet.toLowerCase() || !p.counterAngleDeadlineMs) return this.reject("prise introuvable", []);
    const account = await this.d.repos.accounts.ensure(p.wallet, new Date(now));
    const brand = await this.d.repos.brands.get(p.brandId);
    if (!brand) return this.reject("marque retirée", []);

    const fail = async (motif: RejectMotif) => {
      await this.d.repos.pending.delete(p.id);
      await this.d.store.delete(p.imageKey);
      await this.updateRisk(account, { wallet: p.wallet, deviceFingerprint: input.deviceFingerprint, ip: input.ip, country: input.country }, { layer3Rejected: false, counterAngleFailed: true });
      return this.reject(motif, []);
    };

    if (now > p.counterAngleDeadlineMs) return fail("contre-angle hors délai");

    const [embedding, ph2, first] = await Promise.all([this.d.embedder.embed(input.image), phash(input.image), this.d.store.get(p.imageKey)]);
    if (!first) return fail("prise introuvable");
    const refs = await this.d.corpus.refs(brand.id);
    const verdict = judgeCounterAngle({
      sameImage: { firstPhash: p.counterAnglePhash ?? p.phash, secondPhash: ph2 },
      embeddings: { first: p.counterAngleEmbedding ?? [], second: embedding },
      brandScoreSecond: scoreAgainstRefs(embedding, refs),
      rejectThreshold: REJECT_THRESHOLD,
      viewpoint: await viewpointChange(first, input.image),
    });
    if (!verdict.ok) return fail(verdict.reason ?? "contre-angle trop proche");

    const day = dayIndex(now);
    const hunt = (await this.d.chain.huntToday(day)) ?? [];
    return this.issue(p, {
      inHunt: isInHunt(hunt, brand.id),
      rarity: brand.rarity,
      score: scoreAgainstRefs(p.counterAngleEmbedding ?? [], refs),
      escalated: false,
      risk: account.risk,
      cityLabel: input.cityLabel,
      country: input.country,
      bgPhash: null,
      deviceFingerprint: input.deviceFingerprint,
      ip: input.ip,
      subscriber: account.subscriber,
    });
  }

  /** Réémission après expiration, sans nouvelle photo, sur présentation du reçu de prise. */
  async reissueVoucher(priseId: string, wallet: Address): Promise<{ voucher: Voucher; signature: Hex } | { error: "prise introuvable" | "déjà réclamée" | "voucher encore valide" }> {
    const p = await this.d.repos.pending.get(priseId);
    if (!p || p.wallet.toLowerCase() !== wallet.toLowerCase() || p.sightingId === null || p.lastNonce === null) return { error: "prise introuvable" };
    if (await this.d.chain.nonceUsed(p.lastNonce)) return { error: "déjà réclamée" };
    const now = this.d.now();
    const issuedSec = Number(p.lastNonce >> 20n);
    if (now / 1000 < issuedSec + this.d.config.voucherLifetimeS) return { error: "voucher encore valide" };
    const signed = await this.sign(p, now);
    p.lastNonce = signed.voucher.nonce;
    await this.d.repos.pending.put(p);
    await this.d.repos.sightings.setClaim(p.sightingId, p.tokenAmount > 0n, signed.voucher.nonce);
    return signed;
  }

  /** Suppression réelle de l'image (spec 1.5). Le fragment reste acquis, le hash on-chain aussi. */
  async deleteSighting(id: number, wallet: Address): Promise<boolean> {
    const s = await this.d.repos.sightings.get(id);
    if (!s || s.wallet.toLowerCase() !== wallet.toLowerCase()) return false;
    await this.d.store.delete(s.imageKey);
    await this.d.repos.sightings.markDeleted(id, new Date(this.d.now()));
    return true;
  }

  private async updateRisk(
    account: Account & { riskUpdatedAt?: Date | null },
    input: { wallet: Address; deviceFingerprint: string; ip: string; country: string | null },
    extra: { layer3Rejected: boolean; counterAngleFailed: boolean },
  ): Promise<number> {
    const now = new Date(this.d.now());
    const timestamps = await this.d.repos.sightings.recentTimestamps(input.wallet, 6);
    const intervals = timestamps.slice(1).map((t, i) => t.getTime() - (timestamps[i] as Date).getTime());
    const minuteOf = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();
    const knownDevice = account.deviceFps.includes(input.deviceFingerprint);
    const signals: RiskSignals = {
      walletAgeMs: now.getTime() - account.firstSeen.getTime(),
      walletsOnDevice24h: (await this.d.quotas.walletsOnDevice(input.deviceFingerprint)) + (knownDevice ? 0 : 1),
      walletsOnIp24h: (await this.d.quotas.walletsOnIp(input.ip)) + 1,
      previousCountry: account.lastCountry,
      previousSeenAt: account.lastSeenAt,
      currentCountry: input.country,
      recentIntervalsMs: intervals,
      counterAngleFailed: extra.counterAngleFailed,
      layer3Rejected: extra.layer3Rejected,
      recentMinutesOfDay: timestamps.slice(-3).map(minuteOf),
      currentMinuteOfDay: minuteOf(now),
    };
    const { risk, reasons } = nextRisk(account.risk, account.riskUpdatedAt ?? account.lastSeenAt, signals, now);
    if (reasons.length) this.d.log.info({ wallet: input.wallet, risk, reasons }, "risque mis à jour");
    account.risk = risk;
    account.riskUpdatedAt = now;
    account.lastSeenAt = now;
    if (input.country) account.lastCountry = input.country;
    if (!knownDevice) account.deviceFps = [...account.deviceFps, input.deviceFingerprint].slice(-10);
    await this.d.repos.accounts.update(account);
    return risk;
  }

  /** Même image chez deux joueurs : rejet des deux, signalement des deux comptes (spec 4.5). */
  private async flagSharedImage(current: Account & { riskUpdatedAt?: Date | null }, otherWallet: Address): Promise<void> {
    const now = new Date(this.d.now());
    current.risk = Math.min(100, current.risk + SHARED_IMAGE_RISK);
    current.riskUpdatedAt = now;
    await this.d.repos.accounts.update(current);
    const other = await this.d.repos.accounts.get(otherWallet);
    if (other) {
      other.risk = Math.min(100, other.risk + SHARED_IMAGE_RISK);
      await this.d.repos.accounts.update({ ...other, riskUpdatedAt: now });
    }
    this.d.log.warn({ current: current.wallet, other: otherWallet, weight: WEIGHTS.layer3Reject }, "image partagée entre deux comptes");
  }
}
