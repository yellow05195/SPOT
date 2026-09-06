import { createPublicClient, createWalletClient, http, defineChain, type Address, type Hex, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

export const registryAbi = [
  { type: "function", name: "brandCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
  {
    type: "function",
    name: "getBrand",
    stateMutability: "view",
    inputs: [{ type: "uint32" }],
    outputs: [{ type: "tuple", components: [{ name: "id", type: "uint32" }, { name: "name", type: "string" }, { name: "token", type: "address" }, { name: "priceFeed", type: "address" }, { name: "sector", type: "uint16" }, { name: "active", type: "bool" }] }],
  },
  { type: "function", name: "rarity", stateMutability: "view", inputs: [{ type: "uint32" }], outputs: [{ type: "uint32" }] },
  { type: "function", name: "setRarities", stateMutability: "nonpayable", inputs: [{ type: "uint32[]" }, { type: "uint32[]" }], outputs: [] },
  { type: "function", name: "commitHunts", stateMutability: "nonpayable", inputs: [{ type: "uint32" }, { type: "bytes32[]" }], outputs: [] },
  { type: "function", name: "revealHunt", stateMutability: "nonpayable", inputs: [{ type: "uint32" }, { type: "uint32[5]" }, { type: "bytes32" }], outputs: [] },
  { type: "function", name: "huntCommitment", stateMutability: "view", inputs: [{ type: "uint32" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "huntRevealed", stateMutability: "view", inputs: [{ type: "uint32" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "hunt", stateMutability: "view", inputs: [{ type: "uint32" }], outputs: [{ type: "uint32[5]" }] },
] as const;

export const vaultAbi = [
  { type: "function", name: "inventoryLength", stateMutability: "view", inputs: [{ type: "uint32" }], outputs: [{ type: "uint64" }] },
  { type: "function", name: "inventoryTotal", stateMutability: "view", inputs: [{ type: "uint32" }], outputs: [{ type: "uint128" }] },
  {
    type: "event",
    name: "Claimed",
    inputs: [
      { name: "wallet", type: "address", indexed: true },
      { name: "brandId", type: "uint32", indexed: true },
      { name: "token", type: "address", indexed: false },
      { name: "amount", type: "uint128", indexed: false },
      { name: "usdValue", type: "uint256", indexed: false },
      { name: "nonce", type: "uint64", indexed: false },
      { name: "sightingId", type: "uint256", indexed: false },
    ],
  },
] as const;

export const swapperAbi = [
  {
    type: "function",
    name: "swapAndDeposit",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint32" }, { type: "uint256" }, { type: "uint256" }, { type: "uint128" }, { type: "bytes" }],
    outputs: [{ type: "uint256" }, { type: "uint256" }],
  },
] as const;

export const feedAbi = [
  { type: "function", name: "latestRoundData", stateMutability: "view", inputs: [], outputs: [{ type: "uint80" }, { type: "int256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint80" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

export const stockTokenAbi = [{ type: "function", name: "currentMultiplier", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }] as const;

export function clients(rpcUrl: string, keeperKey: Hex) {
  const account = privateKeyToAccount(keeperKey);
  const pub = createPublicClient({ chain: robinhoodChain, transport: http(rpcUrl) });
  const wallet = createWalletClient({ chain: robinhoodChain, transport: http(rpcUrl), account });
  return { pub, wallet, account };
}

export type Clients = ReturnType<typeof clients>;

export interface OnChainBrand {
  id: number;
  name: string;
  token: Address;
  priceFeed: Address;
  sector: number;
  active: boolean;
  rarity: number;
}

export async function readBrands(c: Clients, registry: Address): Promise<OnChainBrand[]> {
  const count = await c.pub.readContract({ address: registry, abi: registryAbi, functionName: "brandCount" });
  const out: OnChainBrand[] = [];
  for (let id = 1; id <= count; id++) {
    const [b, r] = await Promise.all([
      c.pub.readContract({ address: registry, abi: registryAbi, functionName: "getBrand", args: [id] }),
      c.pub.readContract({ address: registry, abi: registryAbi, functionName: "rarity", args: [id] }),
    ]);
    out.push({ id: b.id, name: b.name, token: b.token, priceFeed: b.priceFeed, sector: b.sector, active: b.active, rarity: Number(r) / 1000 });
  }
  return out;
}

export async function readPrice(c: Clients, feed: Address, token: Address): Promise<{ priceUsd8: bigint; multiplier18: bigint; updatedAt: number }> {
  const [[, answer, , updatedAt], decimals, multiplier18] = await Promise.all([
    c.pub.readContract({ address: feed, abi: feedAbi, functionName: "latestRoundData" }),
    c.pub.readContract({ address: feed, abi: feedAbi, functionName: "decimals" }),
    c.pub.readContract({ address: token, abi: stockTokenAbi, functionName: "currentMultiplier" }),
  ]);
  const priceUsd8 = decimals >= 8 ? answer / 10n ** BigInt(decimals - 8) : answer * 10n ** BigInt(8 - decimals);
  return { priceUsd8, multiplier18, updatedAt: Number(updatedAt) };
}

/** Consommation des 24 dernières heures par marque, lue dans les événements `Claimed` du vault. */
export async function consumedLast24h(c: Clients, vault: Address, fromBlock: bigint): Promise<Map<number, bigint>> {
  const logs = await c.pub.getContractEvents({ address: vault, abi: vaultAbi, eventName: "Claimed", fromBlock });
  const out = new Map<number, bigint>();
  for (const l of logs) {
    const id = Number(l.args.brandId);
    out.set(id, (out.get(id) ?? 0n) + (l.args.amount ?? 0n));
  }
  return out;
}

/**
 * Route de swap : construite off-chain. Ce module produit les calldata du routeur ; l'adresse des
 * pools et l'encodage V4 (PoolKey, hooks, Universal Router commands) dépendent du déploiement réel
 * sur Robinhood Chain et sont à compléter dans `buildRoute` avant la phase 3 en production.
 */
export interface RouteInput {
  token: Address;
  weth: Address;
  usdg: Address;
  ethIn: bigint;
  minOut: bigint;
  recipient: Address;
}

export function buildRoute(_r: RouteInput): Hex {
  throw new Error("buildRoute : encodage Uniswap V4 à compléter avec les adresses réelles des pools (README, phase 3)");
}

export function swapCalldata(brandId: number, ethIn: bigint, minOut: bigint, unitTokens: bigint, route: Hex): Hex {
  return encodeFunctionData({ abi: swapperAbi, functionName: "swapAndDeposit", args: [brandId, ethIn, minOut, unitTokens, route] });
}
