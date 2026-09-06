import { readFile, writeFile } from "node:fs/promises";
import type { Address, Hex } from "viem";
import pino from "pino";
import type { Config } from "./config.js";
import { clients, readBrands, readPrice, consumedLast24h, registryAbi, vaultAbi, swapperAbi, buildRoute, type Clients } from "./chain.js";
import { computeRarities, toChain } from "./rarity.js";
import { planHunts, commitment, dayIndex, type HuntSecret } from "./hunt.js";
import { planPurchase, budgetCycle, minAmountOut, slippageBps } from "./inventory.js";

/** Les trois crons (spec Partie 6), chacun idempotent : relancer un job ne fait jamais deux fois la même chose. */

export interface JobDeps {
  cfg: Config;
  c: Clients;
  log: pino.Logger;
  /** prises validées par marque sur 7 jours (source : la base du claim server ou les événements) */
  prises7d: () => Promise<Map<number, number>>;
  ethUsd: () => Promise<number>;
  secrets: {
    load: () => Promise<HuntSecret[]>;
    save: (s: HuntSecret[]) => Promise<void>;
  };
}

// ───────────────────────────── 6.1 inventaire ─────────────────────────────

export async function inventoryJob(d: JobDeps): Promise<void> {
  const { cfg, c, log } = d;
  if (!cfg.SWAPPER_ADDRESS || !cfg.WETH_ADDRESS || !cfg.USDG_ADDRESS) {
    log.warn("SWAPPER/WETH/USDG absents : inventaire en lecture seule");
  }
  const brands = (await readBrands(c, cfg.REGISTRY_ADDRESS as Address)).filter((b) => b.active);
  const head = await c.pub.getBlockNumber();
  const blocksPerDay = 864_000n; // ~100 ms par bloc
  const consumed = await consumedLast24h(c, cfg.VAULT_ADDRESS as Address, head > blocksPerDay ? head - blocksPerDay : 0n);

  const policy = { minUnits: cfg.MIN_UNITS, minCoverageHours: cfg.MIN_COVERAGE_HOURS, unitUsd: cfg.UNIT_USD, targetUnits: cfg.MIN_UNITS * 2 };
  const plans = [];
  for (const b of brands) {
    const [units, total, price] = await Promise.all([
      c.pub.readContract({ address: cfg.VAULT_ADDRESS as Address, abi: vaultAbi, functionName: "inventoryLength", args: [b.id] }),
      c.pub.readContract({ address: cfg.VAULT_ADDRESS as Address, abi: vaultAbi, functionName: "inventoryTotal", args: [b.id] }),
      readPrice(c, b.priceFeed, b.token),
    ]);
    const plan = planPurchase({ brandId: b.id, units: Number(units), totalTokens: total, consumedLast24hTokens: consumed.get(b.id) ?? 0n, priceUsd8: price.priceUsd8, multiplier18: price.multiplier18 }, policy);
    if (plan) plans.push({ plan, brand: b, price });
    log.info({ brand: b.name, units: Number(units), total: total.toString(), consumed24h: (consumed.get(b.id) ?? 0n).toString(), plan: plan?.reason ?? "ok" }, "inventaire");
  }
  if (plans.length === 0 || !cfg.SWAPPER_ADDRESS) return;

  const balance = await c.pub.getBalance({ address: cfg.SWAPPER_ADDRESS as Address });
  const ethUsd = await d.ethUsd();
  const cycle = budgetCycle(plans.map((p) => p.plan), balance, ethUsd, cfg.MAX_ETH_SHARE_BPS, cfg.MAX_BRANDS_PER_BATCH);
  if (cycle.reduced) log.warn({ balance: balance.toString(), wanted: plans.length }, "ALERTE : achats réduits, plus de 80 % du solde ETH demandé");

  for (const plan of cycle.plans) {
    const entry = plans.find((p) => p.plan.brandId === plan.brandId);
    if (!entry) continue;
    const ethIn = BigInt(Math.round((plan.usdToSpend / ethUsd) * 1e18));
    const minOut = minAmountOut(plan.tokensToBuy, cfg.SLIPPAGE_BPS);
    try {
      const route = buildRoute({ token: entry.brand.token, weth: cfg.WETH_ADDRESS as Address, usdg: cfg.USDG_ADDRESS as Address, ethIn, minOut, recipient: cfg.SWAPPER_ADDRESS as Address });
      const hash = await c.wallet.writeContract({ address: cfg.SWAPPER_ADDRESS as Address, abi: swapperAbi, functionName: "swapAndDeposit", args: [plan.brandId, ethIn, minOut, plan.unitTokens, route] });
      const receipt = await c.pub.waitForTransactionReceipt({ hash });
      log.info({ brand: entry.brand.name, ethIn: ethIn.toString(), expected: plan.tokensToBuy.toString(), minOut: minOut.toString(), status: receipt.status, tx: hash }, "achat");
    } catch (e) {
      log.error({ brand: entry.brand.name, err: (e as Error).message }, "achat échoué — réessai plus petit au prochain cycle");
    }
  }
}

// ───────────────────────────── 6.2 rareté ─────────────────────────────

export async function rarityJob(d: JobDeps): Promise<{ brandId: number; target: number; applied: number }[]> {
  const { cfg, c, log } = d;
  const brands = (await readBrands(c, cfg.REGISTRY_ADDRESS as Address)).filter((b) => b.active);
  const prises = await d.prises7d();
  const result = computeRarities(brands.map((b) => ({ brandId: b.id, prises7d: prises.get(b.id) ?? 0, current: b.rarity })));
  const changed = result.filter((r) => {
    const cur = brands.find((b) => b.id === r.brandId)?.rarity ?? 1;
    return toChain(r.applied) !== toChain(cur);
  });
  for (const r of result) log.info({ brandId: r.brandId, target: r.target.toFixed(3), applied: r.applied.toFixed(3) }, "rareté");
  if (changed.length === 0) return result;
  const hash = await c.wallet.writeContract({
    address: cfg.REGISTRY_ADDRESS as Address,
    abi: registryAbi,
    functionName: "setRarities",
    args: [changed.map((r) => r.brandId), changed.map((r) => toChain(r.applied))],
  });
  await c.pub.waitForTransactionReceipt({ hash });
  log.info({ tx: hash, n: changed.length }, "rareté écrite on-chain");
  return result;
}

// ───────────────────────────── 6.3 chasse ─────────────────────────────

/** Publie les engagements des `HUNT_COMMIT_DAYS` jours qui ne sont pas encore engagés. */
export async function commitHuntsJob(d: JobDeps, nowMs = Date.now()): Promise<number> {
  const { cfg, c, log } = d;
  const today = dayIndex(nowMs);
  const secrets = await d.secrets.load();
  const known = new Set(secrets.map((s) => s.day));
  const brands = (await readBrands(c, cfg.REGISTRY_ADDRESS as Address)).filter((b) => b.active).map((b) => b.id);
  const recent = new Map<number, number>();
  for (const s of secrets.filter((s) => s.day >= today - 14)) for (const id of s.brandIds) recent.set(id, (recent.get(id) ?? 0) + 1);

  // premier jour non engagé
  let firstDay = today + 1;
  while (known.has(firstDay)) firstDay += 1;
  const lastWanted = today + cfg.HUNT_COMMIT_DAYS;
  if (firstDay > lastWanted) return 0;
  const days = lastWanted - firstDay + 1;
  const plan = planHunts(firstDay, days, brands, recent);
  // vérifier on-chain qu'aucun de ces jours n'est déjà engagé (idempotence)
  for (const p of plan) {
    const existing = await c.pub.readContract({ address: cfg.REGISTRY_ADDRESS as Address, abi: registryAbi, functionName: "huntCommitment", args: [p.day] });
    if (existing !== "0x0000000000000000000000000000000000000000000000000000000000000000") throw new Error(`jour ${p.day} déjà engagé on-chain mais absent des secrets locaux`);
  }
  await d.secrets.save([...secrets, ...plan]);
  const hash = await c.wallet.writeContract({ address: cfg.REGISTRY_ADDRESS as Address, abi: registryAbi, functionName: "commitHunts", args: [firstDay, plan.map((p) => p.commitment)] });
  await c.pub.waitForTransactionReceipt({ hash });
  log.info({ tx: hash, firstDay, days }, "chasses engagées");
  return days;
}

/** Révèle la chasse du jour (00:00 UTC), puis complète les engagements pour garder 30 jours d'avance. */
export async function huntJob(d: JobDeps, nowMs = Date.now()): Promise<number[] | null> {
  const { cfg, c, log } = d;
  const today = dayIndex(nowMs);
  const secrets = await d.secrets.load();
  const s = secrets.find((x) => x.day === today);
  if (!s) {
    log.error({ today }, "aucun secret pour la chasse du jour : engager d'abord (commit-hunts)");
    await commitHuntsJob(d, nowMs);
    return null;
  }
  const revealed = await c.pub.readContract({ address: cfg.REGISTRY_ADDRESS as Address, abi: registryAbi, functionName: "huntRevealed", args: [today] });
  if (!revealed) {
    if (commitment(s.day, s.brandIds, s.salt) !== s.commitment) throw new Error("secret corrompu : l'engagement ne correspond pas");
    const hash = await c.wallet.writeContract({
      address: cfg.REGISTRY_ADDRESS as Address,
      abi: registryAbi,
      functionName: "revealHunt",
      args: [today, s.brandIds as [number, number, number, number, number], s.salt as Hex],
    });
    await c.pub.waitForTransactionReceipt({ hash });
    log.info({ tx: hash, today, brandIds: s.brandIds }, "chasse révélée");
  }
  await commitHuntsJob(d, nowMs);
  return s.brandIds;
}

// ───────────────────────────── secrets ─────────────────────────────

export function fileSecrets(path: string): JobDeps["secrets"] {
  return {
    load: async () => {
      try {
        return JSON.parse(await readFile(path, "utf8")) as HuntSecret[];
      } catch {
        return [];
      }
    },
    save: async (s) => {
      await writeFile(path, JSON.stringify(s, null, 2));
    },
  };
}

export function makeDeps(cfg: Config): JobDeps {
  const log = pino({ level: cfg.LOG_LEVEL });
  const c = clients(cfg.CHAIN_RPC_URL, cfg.KEEPER_PRIVATE_KEY as Hex);
  return {
    cfg,
    c,
    log,
    secrets: fileSecrets(cfg.HUNT_SECRETS_FILE),
    prises7d: async () => prisesFromDb(cfg.DATABASE_URL),
    ethUsd: async () => {
      throw new Error("ETH_USD : brancher un feed Chainlink ETH/USD (adresse à confirmer sur Robinhood Chain)");
    },
  };
}

async function prisesFromDb(url: string | undefined): Promise<Map<number, number>> {
  if (!url) return new Map();
  const postgres = (await import("postgres")).default;
  const sql = postgres(url, { max: 1 });
  try {
    const rows = await sql<{ brand_id: number; n: number }[]>`SELECT brand_id, count(*)::int AS n FROM sightings WHERE created_at >= now() - interval '7 days' AND deleted_at IS NULL GROUP BY brand_id`;
    return new Map(rows.map((r) => [r.brand_id, r.n]));
  } finally {
    await sql.end();
  }
}
