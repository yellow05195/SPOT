import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  CHAIN_RPC_URL: z.string().url().default("https://rpc.mainnet.chain.robinhood.com"),
  CHAIN_ID: z.coerce.number().int().default(4663),
  DATABASE_URL: z.string().optional(),

  REGISTRY_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  VAULT_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  SWAPPER_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  ROUTER_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  USDG_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  WETH_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),

  /** Clé du keeper : en KMS en production ; ici une clé de dev. Le keeper ne peut rien retirer du vault. */
  KEEPER_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/),

  MIN_UNITS: z.coerce.number().int().default(200),
  MIN_COVERAGE_HOURS: z.coerce.number().default(4),
  UNIT_USD: z.coerce.number().default(0.5),
  SLIPPAGE_BPS: z.coerce.number().int().default(100), // 1 %
  MAX_BRANDS_PER_BATCH: z.coerce.number().int().default(5),
  MAX_ETH_SHARE_BPS: z.coerce.number().int().default(8000),
  HUNT_COMMIT_DAYS: z.coerce.number().int().default(30),
  HUNT_SECRETS_FILE: z.string().default("./hunt-secrets.json"),
});

export type Config = z.infer<typeof schema>;
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => schema.parse(env);
