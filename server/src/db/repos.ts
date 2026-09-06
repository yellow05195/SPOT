import type { Address } from "viem";
import type { Account, Brand, PendingPrise, SightingRecord } from "../domain/types.js";
import { hamming } from "../vision/phash.js";

/**
 * Dépôts : interfaces minimales dont le serveur a besoin. `MemoryRepos` sert aux tests et au dev
 * sans Postgres ; `PgRepos` (db/pg.ts) les implémente avec drizzle.
 */

export interface BrandRepo {
  get(id: number): Promise<Brand | null>;
  listActive(): Promise<Brand[]>;
  upsert(b: Brand): Promise<void>;
}

export interface AccountRepo {
  get(wallet: Address): Promise<Account | null>;
  ensure(wallet: Address, now: Date): Promise<Account>;
  update(a: Account & { riskUpdatedAt?: Date | null }): Promise<void>;
  count(): Promise<number>;
  countRiskAbove(threshold: number): Promise<number>;
}

export interface PhashMatch {
  sightingId: number;
  wallet: Address;
  distance: number;
}

export interface SightingRepo {
  insert(s: Omit<SightingRecord, "id">): Promise<SightingRecord>;
  get(id: number): Promise<SightingRecord | null>;
  byWallet(wallet: Address, limit: number, offset: number): Promise<SightingRecord[]>;
  /** Fiche la plus proche (distance de Hamming) du même joueur, ou d'autres joueurs sur `days`. */
  nearestByPhash(phash: Buffer, wallet: Address, days: number, now: Date): Promise<{ own: PhashMatch | null; others: PhashMatch | null }>;
  backgroundRepeats(bgPhash: Buffer, wallet: Address, hours: number, now: Date): Promise<number>;
  recentTimestamps(wallet: Address, limit: number): Promise<Date[]>;
  markDeleted(id: number, now: Date): Promise<void>;
  countByDay(days: number, now: Date): Promise<number[]>;
  recent(limit: number, filter?: { brandId?: number; sector?: number; country?: string }): Promise<SightingRecord[]>;
  setClaim(id: number, paid: boolean, nonce: bigint): Promise<void>;
  distinctWallets(days: number, now: Date): Promise<number>;
  distinctCountries(days: number, now: Date): Promise<number>;
}

export interface PendingRepo {
  put(p: PendingPrise): Promise<void>;
  get(id: string): Promise<PendingPrise | null>;
  delete(id: string): Promise<void>;
}

export interface DayStats {
  day: string;
  budgetUsd: number;
  spentUsd: number;
  claims: number;
  sightingsOnly: number;
  rejects: number;
  escalations: number;
}

export interface StatsRepo {
  bump(day: string, field: keyof Omit<DayStats, "day" | "budgetUsd">, amount: number): Promise<void>;
  get(day: string): Promise<DayStats | null>;
  ensure(day: string, budgetUsd: number): Promise<void>;
}

export interface HuntRepo {
  today(day: string): Promise<number[] | null>;
}

export interface Repos {
  brands: BrandRepo;
  accounts: AccountRepo;
  sightings: SightingRepo;
  pending: PendingRepo;
  stats: StatsRepo;
  hunts: HuntRepo;
}

// ───────────────────────────── mémoire ─────────────────────────────

export class MemoryRepos implements Repos {
  readonly brandMap = new Map<number, Brand>();
  readonly accountMap = new Map<string, Account & { riskUpdatedAt?: Date | null }>();
  readonly sightingList: SightingRecord[] = [];
  readonly pendingMap = new Map<string, PendingPrise>();
  readonly statsMap = new Map<string, DayStats>();
  readonly huntMap = new Map<string, number[]>();
  private nextId = 1;

  brands: BrandRepo = {
    get: async (id) => this.brandMap.get(id) ?? null,
    listActive: async () => [...this.brandMap.values()].filter((b) => b.active),
    upsert: async (b) => {
      this.brandMap.set(b.id, b);
    },
  };

  accounts: AccountRepo = {
    get: async (w) => this.accountMap.get(w.toLowerCase()) ?? null,
    ensure: async (w, now) => {
      const key = w.toLowerCase();
      let a = this.accountMap.get(key);
      if (!a) {
        a = { wallet: w, firstSeen: now, risk: 0, subscriber: false, deviceFps: [], lastCountry: null, lastSeenAt: null, riskUpdatedAt: null };
        this.accountMap.set(key, a);
      }
      return a;
    },
    update: async (a) => {
      this.accountMap.set(a.wallet.toLowerCase(), a);
    },
    count: async () => this.accountMap.size,
    countRiskAbove: async (t) => [...this.accountMap.values()].filter((a) => a.risk > t).length,
  };

  sightings: SightingRepo = {
    insert: async (s) => {
      const rec = { ...s, id: this.nextId++ };
      this.sightingList.push(rec);
      return rec;
    },
    get: async (id) => this.sightingList.find((s) => s.id === id) ?? null,
    byWallet: async (w, limit, offset) =>
      this.sightingList
        .filter((s) => s.wallet.toLowerCase() === w.toLowerCase())
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(offset, offset + limit),
    nearestByPhash: async (ph, w, days, now) => {
      let own: PhashMatch | null = null;
      let others: PhashMatch | null = null;
      const since = now.getTime() - days * 86400_000;
      for (const s of this.sightingList) {
        const d = hamming(ph, s.phash);
        if (s.wallet.toLowerCase() === w.toLowerCase()) {
          if (!own || d < own.distance) own = { sightingId: s.id, wallet: s.wallet, distance: d };
        } else if (s.createdAt.getTime() >= since) {
          if (!others || d < others.distance) others = { sightingId: s.id, wallet: s.wallet, distance: d };
        }
      }
      return { own, others };
    },
    backgroundRepeats: async (bg, w, hours, now) => {
      const since = now.getTime() - hours * 3600_000;
      return this.sightingList.filter(
        (s) => s.wallet.toLowerCase() === w.toLowerCase() && s.createdAt.getTime() >= since && s.bgPhash && hamming(bg, s.bgPhash) < 8,
      ).length;
    },
    recentTimestamps: async (w, limit) =>
      this.sightingList
        .filter((s) => s.wallet.toLowerCase() === w.toLowerCase())
        .map((s) => s.createdAt)
        .sort((a, b) => a.getTime() - b.getTime())
        .slice(-limit),
    markDeleted: async (id) => {
      const i = this.sightingList.findIndex((s) => s.id === id);
      if (i >= 0) this.sightingList.splice(i, 1);
    },
    countByDay: async (days, now) => {
      const out: number[] = [];
      for (let d = 1; d <= days; d++) {
        const end = now.getTime() - (d - 1) * 86400_000;
        const start = end - 86400_000;
        out.push(this.sightingList.filter((s) => s.createdAt.getTime() >= start && s.createdAt.getTime() < end).length);
      }
      return out;
    },
    recent: async (limit, filter) =>
      this.sightingList
        .filter((s) => (filter?.brandId ? s.brandId === filter.brandId : true))
        .filter((s) => (filter?.sector ? this.brandMap.get(s.brandId)?.sector === filter.sector : true))
        .filter((s) => (filter?.country ? s.cityLabel.endsWith(`, ${filter.country}`) : true))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit),
    setClaim: async (id, paid, nonce) => {
      const s = this.sightingList.find((x) => x.id === id);
      if (s) {
        s.paid = paid;
        s.nonce = nonce;
      }
    },
    distinctWallets: async (days, now) => {
      const since = now.getTime() - days * 86400_000;
      return new Set(this.sightingList.filter((s) => s.createdAt.getTime() >= since).map((s) => s.wallet.toLowerCase())).size;
    },
    distinctCountries: async (days, now) => {
      const since = now.getTime() - days * 86400_000;
      return new Set(this.sightingList.filter((s) => s.createdAt.getTime() >= since).map((s) => s.cityLabel.split(", ").pop())).size;
    },
  };

  pending: PendingRepo = {
    put: async (p) => {
      this.pendingMap.set(p.id, p);
    },
    get: async (id) => this.pendingMap.get(id) ?? null,
    delete: async (id) => {
      this.pendingMap.delete(id);
    },
  };

  stats: StatsRepo = {
    bump: async (day, field, amount) => {
      const s = this.statsMap.get(day) ?? { day, budgetUsd: 0, spentUsd: 0, claims: 0, sightingsOnly: 0, rejects: 0, escalations: 0 };
      s[field] += amount;
      this.statsMap.set(day, s);
    },
    get: async (day) => this.statsMap.get(day) ?? null,
    ensure: async (day, budgetUsd) => {
      if (!this.statsMap.has(day)) this.statsMap.set(day, { day, budgetUsd, spentUsd: 0, claims: 0, sightingsOnly: 0, rejects: 0, escalations: 0 });
    },
  };

  hunts: HuntRepo = {
    today: async (day) => this.huntMap.get(day) ?? null,
  };
}
