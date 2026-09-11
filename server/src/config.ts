import { z } from "zod";

/**
 * Configuration du claim server. Tout vient de l'environnement, validé au démarrage.
 * La clé du signer n'est JAMAIS en clair en production : `SIGNER_KMS_KEY_ID` (AWS KMS).
 * `SIGNER_DEV_PRIVATE_KEY` n'est acceptée hors production, ou en production avec `ALLOW_HOT_SIGNER=true`
 * (dépannage assumé, à migrer vers KMS).
 */

/** Booléen d'environnement : "0", "false", "no", "off" (insensible à la casse) valent faux ; absent vaut `dflt`. */
const envBool = (dflt: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === "" ? dflt : !["0", "false", "no", "off"].includes(v.trim().toLowerCase())));

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
  /** Accepte une clé en clair en production (dépannage). Le serveur le signale bruyamment au démarrage. */
  ALLOW_HOT_SIGNER: envBool(false),

  S3_BUCKET: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_PUBLIC_BASE_URL: z.string().url().optional(),
  MEDIA_LOCAL_DIR: z.string().optional(),
  MEDIA_IN_DATABASE: envBool(false),
  /** Base publique du dossier média local (disque persistant) quand il n'y a pas de S3. */
  PUBLIC_MEDIA_BASE_URL: z.string().url().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  VISION_MODEL: z.string().default("claude-opus-5"),
  MODELS_DIR: z.string().default("./models"),

  DAILY_BUDGET_USD: z.coerce.number().positive().default(200),
  COUNTER_ANGLE_RATE: z.coerce.number().min(0).max(1).default(0.08),
  COUNTER_ANGLE_RATE_HIGH_RISK: z.coerce.number().min(0).max(1).default(0.4),
  VOUCHER_LIFETIME_S: z.coerce.number().int().positive().default(30 * 60),
  TRUSTED_PROXY: z.coerce.boolean().default(true),
  /** « Fiches d'abord, fragments ensuite » : à faux, les prises sont validées et consignées mais valent 0 fragment. */
  FRAGMENTS_ENABLED: envBool(true),
});

export type Config = z.infer<typeof schema>;

/**
 * Charge et valide la configuration. Les relâchements explicites (clé en clair, disque local sans S3)
 * ne bloquent pas mais ajoutent un message dans `warnings`, que l'appelant journalise.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, warnings: string[] = []): Config {
  const cfg = schema.parse(env);
  if (cfg.NODE_ENV === "production") {
    if (cfg.SIGNER_DEV_PRIVATE_KEY && !cfg.ALLOW_HOT_SIGNER) {
      throw new Error("SIGNER_DEV_PRIVATE_KEY est interdite en production : utiliser SIGNER_KMS_KEY_ID (ou ALLOW_HOT_SIGNER=true en dépannage)");
    }
    if (!cfg.SIGNER_KMS_KEY_ID && !cfg.SIGNER_DEV_PRIVATE_KEY) throw new Error("SIGNER_KMS_KEY_ID requis en production");
    if (!cfg.DATABASE_URL || !cfg.REDIS_URL) throw new Error("DATABASE_URL et REDIS_URL requis en production");
    if (!cfg.S3_BUCKET && cfg.MEDIA_IN_DATABASE) {
      warnings.push("S3_BUCKET absent : médias stockés dans Postgres (MEDIA_IN_DATABASE), passer à S3/R2 dès que possible");
    } else if (!cfg.S3_BUCKET) {
      if (!cfg.MEDIA_LOCAL_DIR) throw new Error("S3_BUCKET requis en production (ou MEDIA_LOCAL_DIR sur un disque persistant, ou MEDIA_IN_DATABASE=true)");
      warnings.push(`S3_BUCKET absent : médias sur le disque local ${cfg.MEDIA_LOCAL_DIR} (doit être persistant)`);
    }
  }
  return cfg;
}
