import { createPublicClient, http, defineChain, type Address, type PublicClient } from "viem";

/** Robinhood Chain (spec 1.1). Horloge = block.timestamp, jamais block.number. */
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

export const vaultAbi = [
  { type: "function", name: "budgetState", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }, { type: "uint256" }, { type: "uint256" }] },
  { type: "function", name: "usdValueOf", stateMutability: "view", inputs: [{ type: "uint32" }, { type: "uint128" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "inventoryTotal", stateMutability: "view", inputs: [{ type: "uint32" }], outputs: [{ type: "uint128" }] },
  { type: "function", name: "inventoryLength", stateMutability: "view", inputs: [{ type: "uint32" }], outputs: [{ type: "uint64" }] },
  { type: "function", name: "reserved", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "used", stateMutability: "view", inputs: [{ type: "uint64" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "entryPausedAt", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
] as const;

export const registryAbi = [
  {
    type: "function",
    name: "getBrand",
    stateMutability: "view",
    inputs: [{ type: "uint32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "id", type: "uint32" },
          { name: "name", type: "string" },
          { name: "token", type: "address" },
          { name: "priceFeed", type: "address" },
          { name: "sector", type: "uint16" },
          { name: "active", type: "bool" },
        ],
      },
    ],
  },
  { type: "function", name: "rarity", stateMutability: "view", inputs: [{ type: "uint32" }], outputs: [{ type: "uint32" }] },
  { type: "function", name: "brandCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
  { type: "function", name: "plateCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
  {
    type: "function",
    name: "getPlate",
    stateMutability: "view",
    inputs: [{ type: "uint32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "id", type: "uint32" },
          { name: "name", type: "string" },
          { name: "brandIds", type: "uint32[]" },
          { name: "opensAt", type: "uint32" },
          { name: "platesSealed", type: "uint32" },
          { name: "sealed_", type: "bool" },
        ],
      },
    ],
  },
  { type: "function", name: "hunt", stateMutability: "view", inputs: [{ type: "uint32" }], outputs: [{ type: "uint32[5]" }] },
  { type: "function", name: "huntRevealed", stateMutability: "view", inputs: [{ type: "uint32" }], outputs: [{ type: "bool" }] },
] as const;

export const feedAbi = [
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint80" }, { type: "int256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint80" }],
  },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

export const stockTokenAbi = [
  { type: "function", name: "currentMultiplier", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

/** Ce que le serveur lit sur la chaîne. Abstrait pour les tests. */
export interface ChainReader {
  budgetState(): Promise<{ day: number; budgetUsd8: bigint; spentUsd8: bigint }>;
  price(feed: Address, token: Address): Promise<{ priceUsd8: bigint; multiplier18: bigint; updatedAt: number }>;
  inventoryTotal(brandId: number): Promise<bigint>;
  nonceUsed(nonce: bigint): Promise<boolean>;
  huntToday(day: number): Promise<number[] | null>;
  rarity(brandId: number): Promise<number>;
  plates(): Promise<PlateInfo[]>;
}

export interface PlateInfo {
  id: number;
  name: string;
  brandIds: number[];
  opensAt: number;
  platesSealed: number;
  closed: boolean;
}

export class ViemChainReader implements ChainReader {
  readonly client: PublicClient;
  constructor(
    rpcUrl: string,
    private readonly vault: Address,
    private readonly registry: Address,
  ) {
    this.client = createPublicClient({ chain: robinhoodChain, transport: http(rpcUrl) });
  }

  async budgetState() {
    const [day, budget, spent] = await this.client.readContract({ address: this.vault, abi: vaultAbi, functionName: "budgetState" });
    return { day, budgetUsd8: budget, spentUsd8: spent };
  }

  async price(feed: Address, token: Address) {
    const [[, answer, , updatedAt], decimals, multiplier18] = await Promise.all([
      this.client.readContract({ address: feed, abi: feedAbi, functionName: "latestRoundData" }),
      this.client.readContract({ address: feed, abi: feedAbi, functionName: "decimals" }),
      this.client.readContract({ address: token, abi: stockTokenAbi, functionName: "currentMultiplier" }),
    ]);
    const priceUsd8 = decimals >= 8 ? answer / 10n ** BigInt(decimals - 8) : answer * 10n ** BigInt(8 - decimals);
    return { priceUsd8, multiplier18, updatedAt: Number(updatedAt) };
  }

  async inventoryTotal(brandId: number) {
    return this.client.readContract({ address: this.vault, abi: vaultAbi, functionName: "inventoryTotal", args: [brandId] });
  }

  async nonceUsed(nonce: bigint) {
    return this.client.readContract({ address: this.vault, abi: vaultAbi, functionName: "used", args: [nonce] });
  }

  async huntToday(day: number) {
    const revealed = await this.client.readContract({ address: this.registry, abi: registryAbi, functionName: "huntRevealed", args: [day] });
    if (!revealed) return null;
    const ids = await this.client.readContract({ address: this.registry, abi: registryAbi, functionName: "hunt", args: [day] });
    return [...ids];
  }

  async rarity(brandId: number) {
    return Number(await this.client.readContract({ address: this.registry, abi: registryAbi, functionName: "rarity", args: [brandId] })) / 1000;
  }

  async plates() {
    const count = await this.client.readContract({ address: this.registry, abi: registryAbi, functionName: "plateCount" });
    const out: PlateInfo[] = [];
    for (let id = 1; id <= count; id++) {
      const p = await this.client.readContract({ address: this.registry, abi: registryAbi, functionName: "getPlate", args: [id] });
      out.push({ id: p.id, name: p.name, brandIds: [...p.brandIds], opensAt: p.opensAt, platesSealed: p.platesSealed, closed: p.sealed_ });
    }
    return out;
  }
}

/** Lecteur factice pour les tests et le dev hors chaîne. */
export class FakeChainReader implements ChainReader {
  budget = { day: 20701, budgetUsd8: 200n * 10n ** 8n, spentUsd8: 0n };
  prices = new Map<string, { priceUsd8: bigint; multiplier18: bigint; updatedAt: number }>();
  inventories = new Map<number, bigint>();
  usedNonces = new Set<bigint>();
  hunt: number[] | null = null;
  rarities = new Map<number, number>();

  async budgetState() {
    return this.budget;
  }
  async price(feed: Address) {
    return this.prices.get(feed.toLowerCase()) ?? { priceUsd8: 100n * 10n ** 8n, multiplier18: 10n ** 18n, updatedAt: Math.floor(Date.now() / 1000) };
  }
  async inventoryTotal(brandId: number) {
    return this.inventories.get(brandId) ?? 10n ** 18n;
  }
  async nonceUsed(nonce: bigint) {
    return this.usedNonces.has(nonce);
  }
  async huntToday() {
    return this.hunt;
  }
  async rarity(brandId: number) {
    return this.rarities.get(brandId) ?? 1;
  }
  plateList: PlateInfo[] = [];
  async plates() {
    return this.plateList;
  }
}
