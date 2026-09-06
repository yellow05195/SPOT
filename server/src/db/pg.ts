import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { Address, Hex } from "viem";
import * as t from "./schema.js";
import type { Repos, PhashMatch, DayStats } from "./repos.js";
import type { Account, Brand, PendingPrise, SightingRecord } from "../domain/types.js";
import { hamming } from "../vision/phash.js";

/** Implémentation Postgres des dépôts (drizzle-orm + postgres.js). */

const hexToBuf = (h: string) => Buffer.from(h.replace(/^0x/, ""), "hex");
const bufToHex = (b: Buffer) => `0x${b.toString("hex")}` as Hex;
const bufToAddr = (b: Buffer) => bufToHex(b) as Address;

function rowToSighting(r: typeof t.sightings.$inferSelect): SightingRecord {
  return {
    id: r.id,
    wallet: bufToAddr(r.wallet),
    brandId: r.brandId,
    createdAt: r.createdAt,
    phash: r.phash,
    bgPhash: r.bgPhash,
    imageKey: r.imageKey,
    imageHash: bufToHex(r.imageHash),
    cityCode: r.cityCode ?? 0,
    cityLabel: r.cityLabel ?? "",
    inHunt: r.inHunt,
    rarityAt: Number(r.rarityAt),
    usdValue: Number(r.usdValue),
    paid: r.paid,
    nonce: r.nonce,
    txClaim: r.txClaim ? bufToHex(r.txClaim) : null,
    visionScore: r.visionScore,
    escalated: r.escalated,
    riskAt: r.riskAt,
  };
}

export class PgRepos implements Repos {
  constructor(private readonly db: PostgresJsDatabase) {}

  static connect(url: string): PgRepos {
    return new PgRepos(drizzle(postgres(url, { max: 10 })));
  }

  brands = {
    get: async (id: number): Promise<Brand | null> => {
      const [r] = await this.db.select().from(t.brands).where(eq(t.brands.id, id));
      return r ? { id: r.id, name: r.name, symbol: r.symbol, token: bufToAddr(r.token), priceFeed: bufToAddr(r.priceFeed), sector: r.sector, active: r.active, rarity: Number(r.rarity) } : null;
    },
    listActive: async (): Promise<Brand[]> => {
      const rows = await this.db.select().from(t.brands).where(eq(t.brands.active, true));
      return rows.map((r) => ({ id: r.id, name: r.name, symbol: r.symbol, token: bufToAddr(r.token), priceFeed: bufToAddr(r.priceFeed), sector: r.sector, active: r.active, rarity: Number(r.rarity) }));
    },
    upsert: async (b: Brand): Promise<void> => {
      await this.db
        .insert(t.brands)
        .values({ id: b.id, name: b.name, symbol: b.symbol, token: hexToBuf(b.token), priceFeed: hexToBuf(b.priceFeed), sector: b.sector, active: b.active, rarity: b.rarity.toFixed(3) })
        .onConflictDoUpdate({ target: t.brands.id, set: { name: b.name, symbol: b.symbol, active: b.active, rarity: b.rarity.toFixed(3) } });
    },
  };

  accounts = {
    get: async (w: Address): Promise<Account | null> => {
      const [r] = await this.db.select().from(t.accounts).where(eq(t.accounts.wallet, hexToBuf(w)));
      return r ? { wallet: w, firstSeen: r.firstSeen, risk: r.risk, subscriber: r.subscriber, deviceFps: r.deviceFp, lastCountry: r.lastCountry, lastSeenAt: r.lastSeenAt } : null;
    },
    ensure: async (w: Address, now: Date): Promise<Account> => {
      await this.db.insert(t.accounts).values({ wallet: hexToBuf(w), firstSeen: now }).onConflictDoNothing();
      return (await this.accounts.get(w)) as Account;
    },
    update: async (a: Account & { riskUpdatedAt?: Date | null }): Promise<void> => {
      await this.db
        .update(t.accounts)
        .set({ risk: a.risk, subscriber: a.subscriber, deviceFp: a.deviceFps, lastCountry: a.lastCountry, lastSeenAt: a.lastSeenAt, ...(a.riskUpdatedAt !== undefined ? { riskUpdatedAt: a.riskUpdatedAt } : {}) })
        .where(eq(t.accounts.wallet, hexToBuf(a.wallet)));
    },
    count: async () => {
      const [r] = await this.db.select({ n: sql<number>`count(*)::int` }).from(t.accounts);
      return r?.n ?? 0;
    },
    countRiskAbove: async (threshold: number) => {
      const [r] = await this.db.select({ n: sql<number>`count(*)::int` }).from(t.accounts).where(sql`${t.accounts.risk} > ${threshold}`);
      return r?.n ?? 0;
    },
  };

  sightings = {
    insert: async (s: Omit<SightingRecord, "id">): Promise<SightingRecord> => {
      const [r] = await this.db
        .insert(t.sightings)
        .values({
          wallet: hexToBuf(s.wallet),
          brandId: s.brandId,
          createdAt: s.createdAt,
          phash: s.phash,
          bgPhash: s.bgPhash,
          imageKey: s.imageKey,
          imageHash: hexToBuf(s.imageHash),
          cityCode: s.cityCode,
          cityLabel: s.cityLabel,
          inHunt: s.inHunt,
          rarityAt: s.rarityAt.toFixed(3),
          usdValue: s.usdValue.toFixed(8),
          paid: s.paid,
          nonce: s.nonce,
          visionScore: s.visionScore,
          escalated: s.escalated,
          riskAt: s.riskAt,
        })
        .returning();
      return rowToSighting(r as typeof t.sightings.$inferSelect);
    },
    get: async (id: number) => {
      const [r] = await this.db.select().from(t.sightings).where(and(eq(t.sightings.id, id), isNull(t.sightings.deletedAt)));
      return r ? rowToSighting(r) : null;
    },
    byWallet: async (w: Address, limit: number, offset: number) => {
      const rows = await this.db
        .select()
        .from(t.sightings)
        .where(and(eq(t.sightings.wallet, hexToBuf(w)), isNull(t.sightings.deletedAt)))
        .orderBy(desc(t.sightings.createdAt))
        .limit(limit)
        .offset(offset);
      return rows.map(rowToSighting);
    },
    /** L'index hash ne sert que l'égalité exacte ; la distance de Hamming se calcule sur les candidats récents. */
    nearestByPhash: async (ph: Buffer, w: Address, days: number, now: Date) => {
      const since = new Date(now.getTime() - days * 86400_000);
      const rows = await this.db
        .select({ id: t.sightings.id, wallet: t.sightings.wallet, phash: t.sightings.phash, createdAt: t.sightings.createdAt })
        .from(t.sightings)
        .where(sql`(${t.sightings.wallet} = ${hexToBuf(w)} OR ${t.sightings.createdAt} >= ${since}) AND ${t.sightings.deletedAt} IS NULL`);
      let own: PhashMatch | null = null;
      let others: PhashMatch | null = null;
      for (const r of rows) {
        const d = hamming(ph, r.phash);
        const same = r.wallet.equals(hexToBuf(w));
        if (same) {
          if (!own || d < own.distance) own = { sightingId: r.id, wallet: w, distance: d };
        } else if (!others || d < others.distance) others = { sightingId: r.id, wallet: bufToAddr(r.wallet), distance: d };
      }
      return { own, others };
    },
    backgroundRepeats: async (bg: Buffer, w: Address, hours: number, now: Date) => {
      const since = new Date(now.getTime() - hours * 3600_000);
      const rows = await this.db
        .select({ bgPhash: t.sightings.bgPhash })
        .from(t.sightings)
        .where(and(eq(t.sightings.wallet, hexToBuf(w)), gte(t.sightings.createdAt, since)));
      return rows.filter((r) => r.bgPhash && hamming(bg, r.bgPhash) < 8).length;
    },
    recentTimestamps: async (w: Address, limit: number) => {
      const rows = await this.db
        .select({ createdAt: t.sightings.createdAt })
        .from(t.sightings)
        .where(eq(t.sightings.wallet, hexToBuf(w)))
        .orderBy(desc(t.sightings.createdAt))
        .limit(limit);
      return rows.map((r) => r.createdAt).reverse();
    },
    markDeleted: async (id: number, now: Date) => {
      await this.db.update(t.sightings).set({ deletedAt: now, imageKey: "" }).where(eq(t.sightings.id, id));
    },
    countByDay: async (days: number, now: Date) => {
      const out: number[] = [];
      for (let d = 1; d <= days; d++) {
        const end = new Date(now.getTime() - (d - 1) * 86400_000);
        const start = new Date(end.getTime() - 86400_000);
        const [r] = await this.db
          .select({ n: sql<number>`count(*)::int` })
          .from(t.sightings)
          .where(sql`${t.sightings.createdAt} >= ${start} AND ${t.sightings.createdAt} < ${end}`);
        out.push(r?.n ?? 0);
      }
      return out;
    },
    recent: async (limit: number, filter?: { brandId?: number; sector?: number; country?: string }) => {
      const conds = [isNull(t.sightings.deletedAt)];
      if (filter?.brandId) conds.push(eq(t.sightings.brandId, filter.brandId));
      if (filter?.country) conds.push(sql`${t.sightings.cityLabel} LIKE ${`%, ${filter.country}`}`);
      if (filter?.sector) conds.push(sql`${t.sightings.brandId} IN (SELECT id FROM brands WHERE sector = ${filter.sector})`);
      const rows = await this.db
        .select()
        .from(t.sightings)
        .where(and(...conds))
        .orderBy(desc(t.sightings.createdAt))
        .limit(limit);
      return rows.map(rowToSighting);
    },
    setClaim: async (id: number, paid: boolean, nonce: bigint) => {
      await this.db.update(t.sightings).set({ paid, nonce }).where(eq(t.sightings.id, id));
    },
    distinctWallets: async (days: number, now: Date) => {
      const since = new Date(now.getTime() - days * 86400_000);
      const [r] = await this.db.select({ n: sql<number>`count(distinct ${t.sightings.wallet})::int` }).from(t.sightings).where(gte(t.sightings.createdAt, since));
      return r?.n ?? 0;
    },
    distinctCountries: async (days: number, now: Date) => {
      const since = new Date(now.getTime() - days * 86400_000);
      const [r] = await this.db
        .select({ n: sql<number>`count(distinct split_part(${t.sightings.cityLabel}, ', ', 2))::int` })
        .from(t.sightings)
        .where(gte(t.sightings.createdAt, since));
      return r?.n ?? 0;
    },
  };

  pending = {
    put: async (p: PendingPrise) => {
      await this.db
        .insert(t.pendingPrises)
        .values({
          id: p.id,
          wallet: hexToBuf(p.wallet),
          brandId: p.brandId,
          sightingId: p.sightingId,
          imageHash: hexToBuf(p.imageHash),
          imageKey: p.imageKey,
          phash: p.phash,
          cityCode: p.cityCode,
          usdValue: p.usdValue.toFixed(8),
          tokenAmount: p.tokenAmount.toString(),
          counterAngleDeadline: p.counterAngleDeadlineMs ? new Date(p.counterAngleDeadlineMs) : null,
          counterAngleEmbedding: p.counterAngleEmbedding,
          counterAnglePhash: p.counterAnglePhash,
          createdAt: p.createdAt,
          lastNonce: p.lastNonce,
        })
        .onConflictDoUpdate({
          target: t.pendingPrises.id,
          set: { sightingId: p.sightingId, lastNonce: p.lastNonce, counterAngleDeadline: p.counterAngleDeadlineMs ? new Date(p.counterAngleDeadlineMs) : null },
        });
    },
    get: async (id: string): Promise<PendingPrise | null> => {
      const [r] = await this.db.select().from(t.pendingPrises).where(eq(t.pendingPrises.id, id));
      if (!r) return null;
      return {
        id: r.id,
        wallet: bufToAddr(r.wallet),
        brandId: r.brandId,
        sightingId: r.sightingId,
        imageHash: bufToHex(r.imageHash),
        imageKey: r.imageKey,
        phash: r.phash,
        cityCode: r.cityCode,
        usdValue: Number(r.usdValue),
        tokenAmount: BigInt(r.tokenAmount),
        counterAngleDeadlineMs: r.counterAngleDeadline ? r.counterAngleDeadline.getTime() : null,
        counterAngleEmbedding: (r.counterAngleEmbedding as number[] | null) ?? null,
        counterAnglePhash: r.counterAnglePhash,
        createdAt: r.createdAt,
        lastNonce: r.lastNonce,
      };
    },
    delete: async (id: string) => {
      await this.db.delete(t.pendingPrises).where(eq(t.pendingPrises.id, id));
    },
  };

  stats = {
    bump: async (day: string, field: keyof Omit<DayStats, "day" | "budgetUsd">, amount: number) => {
      const col = { spentUsd: t.budgetDays.spentUsd, claims: t.budgetDays.claims, sightingsOnly: t.budgetDays.sightingsOnly, rejects: t.budgetDays.rejects, escalations: t.budgetDays.escalations }[field];
      await this.db.execute(sql`UPDATE budget_days SET ${sql.identifier(col.name)} = ${sql.identifier(col.name)} + ${amount} WHERE day = ${day}`);
    },
    get: async (day: string): Promise<DayStats | null> => {
      const [r] = await this.db.select().from(t.budgetDays).where(eq(t.budgetDays.day, day));
      return r ? { day, budgetUsd: Number(r.budgetUsd), spentUsd: Number(r.spentUsd), claims: r.claims, sightingsOnly: r.sightingsOnly, rejects: r.rejects, escalations: r.escalations } : null;
    },
    ensure: async (day: string, budgetUsd: number) => {
      await this.db.insert(t.budgetDays).values({ day, budgetUsd: budgetUsd.toFixed(8) }).onConflictDoNothing();
    },
  };

  hunts = {
    today: async (day: string): Promise<number[] | null> => {
      const [r] = await this.db.select().from(t.hunts).where(eq(t.hunts.day, day));
      return r?.revealedAt ? r.brandIds : null;
    },
  };
}
