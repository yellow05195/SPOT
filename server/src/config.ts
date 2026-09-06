import { z } from "zod";

/**
 * Configuration du claim server. Tout vient de l'environnement, validé au démarrage.
 * La clé du signer n'est JAMAIS en clair en production : `SIGNER_KMS_KEY_ID` (AWS KMS).
 * `SIGNER_DEV_PRIVATE_KEY` n'est acceptée que hors production.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.string().default("info"),

  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),

  CHAIN_RPC_URL: z.string().url().default("https://rpc.mainnet.chain.robinhood.com"),
  CHAIN_ID: z.coerce.number().int().default(4663),
  VAULT_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  REGISTRY_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  SIGHTINGS_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),

  SIGNER_KMS_KEY_ID: z.string().optional(),
  AWS_REGION: z.string().optional(),
  SIGNER_DEV_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),

  S3_BUCKET: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_PUBLIC_BASE_URL: z.string().url().optional(),
  MEDIA_LOCAL_DIR: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  VISION_MODEL: z.string().default("claude-opus-5"),
  MODELS_DIR: z.string().default("./models"),

  DAILY_BUDGET_USD: z.coerce.number().positive().default(200),
  COUNTER_ANGLE_RATE: z.coerce.number().min(0).max(1).default(0.08),
  COUNTER_ANGLE_RATE_HIGH_RISK: z.coerce.number().min(0).max(1).default(0.4),
  VOUCHER_LIFETIME_S: z.coerce.number().int().positive().default(30 * 60),
  TRUSTED_PROXY: z.coerce.boolean().default(true),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const cfg = schema.parse(env);
  if (cfg.NODE_ENV === "production") {
    if (cfg.SIGNER_DEV_PRIVATE_KEY) {
      throw new Error("SIGNER_DEV_PRIVATE_KEY est interdite en production : utiliser SIGNER_KMS_KEY_ID");
    }
    if (!cfg.SIGNER_KMS_KEY_ID) throw new Error("SIGNER_KMS_KEY_ID requis en production");
    if (!cfg.DATABASE_URL || !cfg.REDIS_URL) throw new Error("DATABASE_URL et REDIS_URL requis en production");
    if (!cfg.S3_BUCKET) throw new Error("S3_BUCKET requis en production");
  }
  return cfg;
}
