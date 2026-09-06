import { erc20Abi, type Address } from "viem";
import type { Brand } from "../domain/types.js";
import type { Repos } from "../db/repos.js";
import { registryAbi, type ViemChainReader } from "./client.js";

/**
 * The registry on-chain is the source of truth for brands (admission, withdrawal, rarity).
 * The server mirrors it into its own store at start-up and every few minutes, so the API
 * and the claim pipeline never depend on an RPC round-trip per request.
 */
export async function readBrands(reader: ViemChainReader, registry: Address): Promise<Brand[]> {
  const count = await reader.client.readContract({ address: registry, abi: registryAbi, functionName: "brandCount" });
  const out: Brand[] = [];
  for (let id = 1; id <= Number(count); id++) {
    const [b, r] = await Promise.all([
      reader.client.readContract({ address: registry, abi: registryAbi, functionName: "getBrand", args: [id] }),
      reader.client.readContract({ address: registry, abi: registryAbi, functionName: "rarity", args: [id] }),
    ]);
    let symbol: string | null = null;
    try {
      symbol = await reader.client.readContract({ address: b.token, abi: erc20Abi, functionName: "symbol" });
    } catch {
      symbol = null;
    }
    out.push({ id: b.id, name: b.name, symbol, token: b.token, priceFeed: b.priceFeed, sector: b.sector, active: b.active, rarity: Number(r) / 1000 });
  }
  return out;
}

export async function syncBrands(reader: ViemChainReader, registry: Address, repos: Repos, log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void }): Promise<number> {
  try {
    const brands = await readBrands(reader, registry);
    for (const b of brands) await repos.brands.upsert(b);
    log.info({ brands: brands.length, active: brands.filter((b) => b.active).length }, "marques synchronisées depuis le registre");
    return brands.length;
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "synchronisation des marques impossible");
    return 0;
  }
}

/** Start-up sync, then a steady refresh. Returns the timer so a test or a shutdown can clear it. */
export function startBrandSync(reader: ViemChainReader, registry: Address, repos: Repos, log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void }, everyMs = 5 * 60_000): NodeJS.Timeout {
  void syncBrands(reader, registry, repos, log);
  const t = setInterval(() => void syncBrands(reader, registry, repos, log), everyMs);
  t.unref();
  return t;
}
