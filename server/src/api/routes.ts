import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { getAddress, isAddress, verifyMessage, type Address, type Hex } from "viem";
import type { PriseService } from "../claim/orchestrate.js";
import type { Repos } from "../db/repos.js";
import type { ChainReader } from "../chain/client.js";
import type { ObjectStore } from "../media/storage.js";
import type { VoucherSigner } from "../voucher/sign.js";
import type { SensorSample, PriseOutcome } from "../domain/types.js";
import { cityCode, cityLabel } from "../infra/city.js";
import { CITIES } from "../infra/cities.js";

/** A client may name its city, but only one we know, and only inside the country its IP says it is in. */
function knownCity(claimed: string | undefined, edgeCity: string | null, country: string | null): string | null {
  const c = (claimed ?? "").trim();
  if (c && country && Object.prototype.hasOwnProperty.call(CITIES, `${c}, ${country.toUpperCase()}`)) return c;
  return edgeCity;
}
import { dayIndex, secondsUntilReset } from "../claim/hunt.js";
import { RISK_NO_FRAGMENTS } from "../risk/score.js";

/**
 * API (spec 7.2). Les réponses ne parlent jamais d'« erreur 422 » : un rejet est un motif en clair.
 *   POST /prise                  2 images + capteurs → voucher | contre-angle | rejet
 *   POST /prise/contre-angle     3e image → voucher | rejet
 *   POST /prise/:id/voucher      réémission après expiration (sans nouvelle photo)
 *   GET  /chasse · /marques · /carnet/:wallet · /planches · /terrain · /vault · /stats
 *   DELETE /fiche/:id            suppression réelle de l'image
 */

export interface RouteDeps {
  service: PriseService;
  repos: Repos;
  chain: ChainReader;
  store: ObjectStore;
  signer: VoucherSigner;
  config: { dailyBudgetUsd: number; chainId: number; vault: Address | null; explorer: string; fragmentsEnabled: boolean };
  now: () => number;
}

const sensorSchema = z.array(z.object({ t: z.number(), ax: z.number(), ay: z.number(), az: z.number(), gx: z.number(), gy: z.number(), gz: z.number() })).max(2000);

function clientIp(req: FastifyRequest): string {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string") return cf;
  return req.ip;
}

function geo(req: FastifyRequest): { country: string | null; city: string | null } {
  // outside production, DEV_COUNTRY stands in for the edge header (local runs have no Cloudflare in front)
  const country = req.headers["cf-ipcountry"] ?? (process.env.NODE_ENV !== "production" ? process.env.DEV_COUNTRY : undefined);
  const city = req.headers["cf-ipcity"];
  return { country: typeof country === "string" && country !== "XX" ? country : null, city: typeof city === "string" ? city : null };
}

function serialize(o: PriseOutcome) {
  if (o.kind !== "valide") return o;
  return {
    ...o,
    voucher: {
      ...o.voucher,
      amount: o.voucher.amount.toString(),
      nonce: o.voucher.nonce.toString(),
      issuedAt: o.voucher.issuedAt.toString(),
      deadline: o.voucher.deadline.toString(),
    },
  };
}

async function readMultipart(req: FastifyRequest): Promise<{ files: Map<string, Buffer>; fields: Map<string, string> }> {
  const files = new Map<string, Buffer>();
  const fields = new Map<string, string>();
  for await (const part of req.parts({ limits: { fileSize: 12 * 1024 * 1024, files: 3 } })) {
    if (part.type === "file") files.set(part.fieldname, await part.toBuffer());
    else fields.set(part.fieldname, String(part.value));
  }
  return { files, fields };
}

export async function registerRoutes(app: FastifyInstance, d: RouteDeps): Promise<void> {
  app.post("/prise", async (req, reply) => {
    const { files, fields } = await readMultipart(req);
    const wallet = fields.get("wallet");
    const brandId = Number(fields.get("brandId"));
    const frameA = files.get("frameA");
    const frameB = files.get("frameB");
    if (!wallet || !isAddress(wallet) || !Number.isInteger(brandId) || !frameA || !frameB) {
      return reply.code(400).send({ kind: "rejet", motif: "prise incomplète", flags: [] });
    }
    const sensors = sensorSchema.safeParse(JSON.parse(fields.get("sensors") ?? "[]"));
    const g = geo(req);
    const label = cityLabel(knownCity(fields.get("city"), g.city, g.country), g.country);
    const outcome = await d.service.handlePrise({
      wallet: getAddress(wallet),
      brandId,
      frameA,
      frameB,
      sensors: (sensors.success ? sensors.data : []) as SensorSample[],
      clientTimestampMs: Number(fields.get("clientTimestamp") ?? 0),
      deviceFingerprint: fields.get("deviceFingerprint") ?? "inconnu",
      ip: clientIp(req),
      country: g.country,
      cityCode: cityCode(label),
      cityLabel: label,
    });
    return serialize(outcome);
  });

  app.post("/prise/contre-angle", async (req, reply) => {
    const { files, fields } = await readMultipart(req);
    const wallet = fields.get("wallet");
    const priseId = fields.get("priseId");
    const image = files.get("image");
    if (!wallet || !isAddress(wallet) || !priseId || !image) return reply.code(400).send({ kind: "rejet", motif: "prise incomplète", flags: [] });
    const g = geo(req);
    return serialize(
      await d.service.handleCounterAngle({
        priseId,
        wallet: getAddress(wallet),
        image,
        deviceFingerprint: fields.get("deviceFingerprint") ?? "inconnu",
        ip: clientIp(req),
        country: g.country,
        cityLabel: cityLabel(knownCity(fields.get("city"), g.city, g.country), g.country),
      }),
    );
  });

  app.post<{ Params: { id: string }; Body: { wallet?: string } }>("/prise/:id/voucher", async (req, reply) => {
    const wallet = req.body?.wallet;
    if (!wallet || !isAddress(wallet)) return reply.code(400).send({ error: "wallet requis" });
    const res = await d.service.reissueVoucher(req.params.id, getAddress(wallet));
    if ("error" in res) return reply.code(409).send(res);
    return {
      voucher: { ...res.voucher, amount: res.voucher.amount.toString(), nonce: res.voucher.nonce.toString(), issuedAt: res.voucher.issuedAt.toString(), deadline: res.voucher.deadline.toString() },
      signature: res.signature,
    };
  });

  app.get("/chasse", async () => {
    const now = d.now();
    const day = dayIndex(now);
    const ids = (await d.chain.huntToday(day)) ?? (await d.repos.hunts.today(new Date(now).toISOString().slice(0, 10))) ?? [];
    const brands = await Promise.all(ids.map((id) => d.repos.brands.get(id)));
    const stats = await d.repos.stats.get(new Date(now).toISOString().slice(0, 10));
    const budget = await d.chain.budgetState();
    return {
      day,
      brands: brands.filter(Boolean).map((b) => ({ id: b!.id, name: b!.name, symbol: b!.symbol, sector: b!.sector, rarity: b!.rarity })),
      budgetUsd: Number(budget.budgetUsd8) / 1e8,
      spentUsd: Number(budget.spentUsd8) / 1e8,
      sightingsToday: (stats?.claims ?? 0) + (stats?.sightingsOnly ?? 0),
      resetInSeconds: secondsUntilReset(now),
      budgetExhausted: budget.spentUsd8 >= budget.budgetUsd8,
      fragmentsEnabled: d.config.fragmentsEnabled,
    };
  });

  app.get("/marques", async () => {
    const brands = await d.repos.brands.listActive();
    return { brands: brands.map((b) => ({ id: b.id, name: b.name, symbol: b.symbol, sector: b.sector, rarity: b.rarity })) };
  });

  app.get<{ Params: { wallet: string }; Querystring: { page?: string } }>("/carnet/:wallet", async (req, reply) => {
    if (!isAddress(req.params.wallet)) return reply.code(400).send({ error: "wallet invalide" });
    const page = Math.max(0, Number(req.query.page ?? 0));
    const rows = await d.repos.sightings.byWallet(getAddress(req.params.wallet), 24, page * 24);
    return { page, fiches: rows.map((s) => publicSighting(s, d.store)) };
  });

  app.get("/planches", async () => {
    return { plates: await d.chain.plates() };
  });

  app.get<{ Querystring: { marque?: string; secteur?: string; pays?: string } }>("/terrain", async (req) => {
    const rows = await d.repos.sightings.recent(60, {
      ...(req.query.marque ? { brandId: Number(req.query.marque) } : {}),
      ...(req.query.secteur ? { sector: Number(req.query.secteur) } : {}),
      ...(req.query.pays ? { country: req.query.pays.toUpperCase() } : {}),
    });
    return { fiches: rows.map((s) => publicSighting(s, d.store)) };
  });

  // the processed photos, whatever the store behind (disk, Postgres, memory); S3 serves its own URLs
  app.get<{ Params: { "*": string } }>("/media/*", async (req, reply) => {
    const key = req.params["*"];
    if (!/^[A-Za-z0-9._/-]{1,200}$/.test(key) || key.includes("..")) return reply.code(400).send({ error: "bad key" });
    const body = await d.store.get(key);
    if (!body) return reply.code(404).send({ error: "not found" });
    const maybe = d.store as ObjectStore & { contentType?: (k: string) => Promise<string | null> };
    const type = (maybe.contentType ? await maybe.contentType(key) : null) ?? (key.endsWith(".webp") ? "image/webp" : "application/octet-stream");
    return reply.header("content-type", type).header("cache-control", "public, max-age=31536000, immutable").send(body);
  });

  app.get("/vault", async () => {
    const budget = await d.chain.budgetState();
    const brands = await d.repos.brands.listActive();
    const rows = await Promise.all(
      brands.map(async (b) => {
        const total = await d.chain.inventoryTotal(b.id);
        const price = await d.chain.price(b.priceFeed, b.token).catch(() => null);
        const usd = price ? Number((total * price.priceUsd8 * price.multiplier18) / 10n ** 36n) / 1e8 : null;
        return { brandId: b.id, name: b.name, token: b.token, units: total.toString(), usdValue: usd, explorer: `${d.config.explorer}/address/${b.token}` };
      }),
    );
    return {
      vault: d.config.vault,
      explorer: d.config.vault ? `${d.config.explorer}/address/${d.config.vault}` : null,
      day: budget.day,
      budgetUsd: Number(budget.budgetUsd8) / 1e8,
      spentUsd: Number(budget.spentUsd8) / 1e8,
      status: budget.spentUsd8 >= budget.budgetUsd8 ? "BUDGET ÉPUISÉ" : "APPROVISIONNÉ",
      brands: rows,
    };
  });

  /** Public, même quand c'est mauvais (spec 7.2, Partie 12). */
  app.get("/stats", async () => {
    const now = new Date(d.now());
    const days = await d.repos.sightings.countByDay(7, now);
    const [wallets7d, countries7d, risky, accounts] = await Promise.all([
      d.repos.sightings.distinctWallets(7, now),
      d.repos.sightings.distinctCountries(7, now),
      d.repos.accounts.countRiskAbove(RISK_NO_FRAGMENTS),
      d.repos.accounts.count(),
    ]);
    const today = await d.repos.stats.get(now.toISOString().slice(0, 10));
    const total7d = days.reduce((a, b) => a + b, 0);
    const escalationRate = today && today.claims + today.sightingsOnly + today.rejects > 0 ? today.escalations / (today.claims + today.sightingsOnly + today.rejects) : 0;
    return {
      prisesParJour: days,
      prisesParJoueur7j: wallets7d === 0 ? 0 : Number((total7d / wallets7d).toFixed(2)),
      joueursActifs7j: wallets7d,
      tauxEscalade: Number(escalationRate.toFixed(3)),
      comptesRisqueEleve: accounts === 0 ? 0 : Number((risky / accounts).toFixed(4)),
      diversiteGeographique: countries7d,
      budgetDuJour: today ? { budgetUsd: today.budgetUsd, spentUsd: today.spentUsd, claims: today.claims, fichesSeules: today.sightingsOnly, rejets: today.rejects } : null,
    };
  });

  app.delete<{ Params: { id: string }; Body: { wallet?: string; signature?: string } }>("/fiche/:id", async (req, reply) => {
    const id = Number(req.params.id);
    const wallet = req.body?.wallet;
    const signature = req.body?.signature as Hex | undefined;
    if (!wallet || !isAddress(wallet) || !signature || !Number.isInteger(id)) return reply.code(400).send({ error: "wallet et signature requis" });
    const ok = await verifyMessage({ address: getAddress(wallet), message: deletionMessage(id), signature }).catch(() => false);
    if (!ok) return reply.code(403).send({ error: "signature invalide" });
    const deleted = await d.service.deleteSighting(id, getAddress(wallet));
    if (!deleted) return reply.code(404).send({ error: "fiche introuvable" });
    return { deleted: true, note: "l'image est supprimée ; le fragment reste acquis" };
  });

  app.get("/sante", async () => ({ ok: true, chainId: d.config.chainId }));

  /** Sonde de l'hébergeur (Render, Fly, VPS) : sans auth, 200 dès que le serveur écoute. */
  app.get("/health", async () => ({
    ok: true,
    signer: d.signer.address,
    brands: (await d.repos.brands.listActive()).length,
    fragmentsEnabled: d.config.fragmentsEnabled,
    chain: d.config.chainId,
  }));
}

export function deletionMessage(id: number): string {
  return `SPOT : je supprime l'image de ma fiche n° ${id}. Le fragment reste acquis.`;
}

function publicSighting(s: { id: number; brandId: number; createdAt: Date; imageKey: string; imageHash: Hex; cityLabel: string; inHunt: boolean; rarityAt: number; usdValue: number; paid: boolean | null }, store: ObjectStore) {
  return {
    id: s.id,
    brandId: s.brandId,
    date: s.createdAt.toISOString(),
    image: s.imageKey ? store.publicUrl(s.imageKey) : null,
    imageHash: s.imageHash,
    city: s.cityLabel,
    inHunt: s.inHunt,
    rarity: s.rarityAt,
    usdValue: s.usdValue,
    paid: s.paid,
  };
}
