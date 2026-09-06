import { Redis } from "ioredis";

/** Abstraction clé-valeur : Redis en production, mémoire en test. TTL en secondes. */
export interface Kv {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlS?: number): Promise<void>;
  incr(key: string, ttlS?: number): Promise<number>;
  sadd(key: string, member: string, ttlS?: number): Promise<number>; // taille de l'ensemble après ajout
  scard(key: string): Promise<number>;
  sismember(key: string, member: string): Promise<boolean>;
  del(key: string): Promise<void>;
}

export class MemoryKv implements Kv {
  private readonly values = new Map<string, { v: string; exp: number | null }>();
  private readonly sets = new Map<string, { s: Set<string>; exp: number | null }>();
  constructor(private readonly now: () => number = () => Date.now()) {}

  private alive<T extends { exp: number | null }>(map: Map<string, T>, key: string): T | undefined {
    const e = map.get(key);
    if (!e) return undefined;
    if (e.exp !== null && e.exp <= this.now()) {
      map.delete(key);
      return undefined;
    }
    return e;
  }
  async get(key: string) {
    return this.alive(this.values, key)?.v ?? null;
  }
  async set(key: string, value: string, ttlS?: number) {
    this.values.set(key, { v: value, exp: ttlS ? this.now() + ttlS * 1000 : null });
  }
  async incr(key: string, ttlS?: number) {
    const e = this.alive(this.values, key);
    const n = (e ? Number(e.v) : 0) + 1;
    this.values.set(key, { v: String(n), exp: e ? e.exp : ttlS ? this.now() + ttlS * 1000 : null });
    return n;
  }
  async sadd(key: string, member: string, ttlS?: number) {
    let e = this.alive(this.sets, key);
    if (!e) {
      e = { s: new Set(), exp: ttlS ? this.now() + ttlS * 1000 : null };
      this.sets.set(key, e);
    }
    e.s.add(member);
    return e.s.size;
  }
  async scard(key: string) {
    return this.alive(this.sets, key)?.s.size ?? 0;
  }
  async sismember(key: string, member: string) {
    return this.alive(this.sets, key)?.s.has(member) ?? false;
  }
  async del(key: string) {
    this.values.delete(key);
    this.sets.delete(key);
  }
}

export class RedisKv implements Kv {
  constructor(private readonly redis: Redis) {}
  static connect(url: string): RedisKv {
    return new RedisKv(new Redis(url, { maxRetriesPerRequest: 2 }));
  }
  async get(key: string) {
    return this.redis.get(key);
  }
  async set(key: string, value: string, ttlS?: number) {
    if (ttlS) await this.redis.set(key, value, "EX", ttlS);
    else await this.redis.set(key, value);
  }
  async incr(key: string, ttlS?: number) {
    const n = await this.redis.incr(key);
    if (n === 1 && ttlS) await this.redis.expire(key, ttlS);
    return n;
  }
  async sadd(key: string, member: string, ttlS?: number) {
    await this.redis.sadd(key, member);
    if (ttlS) await this.redis.expire(key, ttlS, "NX");
    return this.redis.scard(key);
  }
  async scard(key: string) {
    return this.redis.scard(key);
  }
  async sismember(key: string, member: string) {
    return (await this.redis.sismember(key, member)) === 1;
  }
  async del(key: string) {
    await this.redis.del(key);
  }
}
