import type { Kv } from "../infra/kv.js";

/**
 * Quotas fixes (spec 4.7), en Redis :
 *   4 prises/jour/wallet (illimité pour les abonnés, quotas anti-abus maintenus)
 *   1 prise/marque/jour/wallet · 20 min entre deux prises · 2 wallets/appareil/jour · 6 wallets/IP/jour
 * Le rejet ne consomme JAMAIS de quota : `check` puis `consume` seulement après validation.
 */

export const DAILY_PRISES = 4;
export const MIN_INTERVAL_S = 20 * 60;
export const WALLETS_PER_DEVICE = 2;
export const WALLETS_PER_IP = 6;
const DAY_S = 24 * 3600;

export interface QuotaSubject {
  wallet: string;
  brandId: number;
  deviceFingerprint: string;
  ip: string;
  subscriber: boolean;
}

export type QuotaVerdict =
  | { ok: true }
  | { ok: false; reason: "prises du jour épuisées" | "marque déjà consignée aujourd'hui" | "trop tôt depuis la dernière prise" | "trop de wallets sur cet appareil" | "trop de wallets sur cette adresse" };

export class Quotas {
  constructor(
    private readonly kv: Kv,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private day(): string {
    return String(Math.floor(this.now() / 1000 / DAY_S));
  }
  private k(parts: string[]): string {
    return ["q", ...parts].join(":");
  }

  async check(s: QuotaSubject): Promise<QuotaVerdict> {
    const w = s.wallet.toLowerCase();
    const d = this.day();
    // les quotas anti-abus (appareil, IP) sont vérifiés même pour les abonnés
    const devWallets = await this.kv.scard(this.k(["dev", s.deviceFingerprint, d]));
    if (devWallets >= WALLETS_PER_DEVICE && !(await this.kv.sismember(this.k(["dev", s.deviceFingerprint, d]), w))) {
      return { ok: false, reason: "trop de wallets sur cet appareil" };
    }
    const ipWallets = await this.kv.scard(this.k(["ip", s.ip, d]));
    if (ipWallets >= WALLETS_PER_IP && !(await this.kv.sismember(this.k(["ip", s.ip, d]), w))) {
      return { ok: false, reason: "trop de wallets sur cette adresse" };
    }
    if (await this.kv.get(this.k(["brand", w, String(s.brandId), d]))) {
      return { ok: false, reason: "marque déjà consignée aujourd'hui" };
    }
    const last = await this.kv.get(this.k(["last", w]));
    if (last && this.now() / 1000 - Number(last) < MIN_INTERVAL_S) {
      return { ok: false, reason: "trop tôt depuis la dernière prise" };
    }
    if (!s.subscriber) {
      const count = Number((await this.kv.get(this.k(["day", w, d]))) ?? 0);
      if (count >= DAILY_PRISES) return { ok: false, reason: "prises du jour épuisées" };
    }
    return { ok: true };
  }

  /** À appeler UNIQUEMENT après une prise validée. */
  async consume(s: QuotaSubject): Promise<void> {
    const w = s.wallet.toLowerCase();
    const d = this.day();
    await this.kv.incr(this.k(["day", w, d]), DAY_S + 3600);
    await this.kv.set(this.k(["brand", w, String(s.brandId), d]), "1", DAY_S + 3600);
    await this.kv.set(this.k(["last", w]), String(Math.floor(this.now() / 1000)), MIN_INTERVAL_S + 60);
    await this.kv.sadd(this.k(["dev", s.deviceFingerprint, d]), w, DAY_S + 3600);
    await this.kv.sadd(this.k(["ip", s.ip, d]), w, DAY_S + 3600);
  }

  async walletsOnDevice(deviceFingerprint: string): Promise<number> {
    return this.kv.scard(this.k(["dev", deviceFingerprint, this.day()]));
  }
  async walletsOnIp(ip: string): Promise<number> {
    return this.kv.scard(this.k(["ip", ip, this.day()]));
  }
  async prisesToday(wallet: string): Promise<number> {
    return Number((await this.kv.get(this.k(["day", wallet.toLowerCase(), this.day()]))) ?? 0);
  }
}
