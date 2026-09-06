import { pgTable, integer, bigserial, text, customType, smallint, boolean, numeric, timestamp, date, real, bigint, index, jsonb } from "drizzle-orm/pg-core";

/** Schéma Postgres (spec 7.1). `bytea` via un type custom : drizzle n'en a pas de natif. */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const brands = pgTable("brands", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  symbol: text("symbol"),
  token: bytea("token").notNull(),
  priceFeed: bytea("price_feed").notNull(),
  sector: smallint("sector").notNull(),
  active: boolean("active").notNull().default(true),
  rarity: numeric("rarity", { precision: 6, scale: 3 }).notNull().default("1.000"),
});

export const sightings = pgTable(
  "sightings",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    wallet: bytea("wallet").notNull(),
    brandId: integer("brand_id")
      .notNull()
      .references(() => brands.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    phash: bytea("phash").notNull(),
    bgPhash: bytea("bg_phash"),
    imageKey: text("image_key").notNull(), // objet stocké (image traitée)
    imageHash: bytea("image_hash").notNull(), // sha256 de l'image traitée
    cityCode: integer("city_code"), // ville, jamais de coordonnées
    cityLabel: text("city_label"),
    inHunt: boolean("in_hunt").notNull(),
    rarityAt: numeric("rarity_at", { precision: 6, scale: 3 }).notNull(),
    usdValue: numeric("usd_value", { precision: 20, scale: 8 }).notNull(),
    paid: boolean("paid"),
    nonce: bigint("nonce", { mode: "bigint" }).unique(),
    txClaim: bytea("tx_claim"),
    visionScore: real("vision_score").notNull(),
    escalated: boolean("escalated").notNull(),
    riskAt: smallint("risk_at").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("sightings_phash_idx").using("hash", t.phash), index("sightings_wallet_created_idx").on(t.wallet, t.createdAt)],
);

export const accounts = pgTable("accounts", {
  wallet: bytea("wallet").primaryKey(),
  firstSeen: timestamp("first_seen", { withTimezone: true }).notNull(),
  risk: smallint("risk").notNull().default(0),
  riskUpdatedAt: timestamp("risk_updated_at", { withTimezone: true }),
  subscriber: boolean("subscriber").notNull().default(false),
  deviceFp: text("device_fp").array().notNull().default([]),
  lastCountry: text("last_country"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

export const budgetDays = pgTable("budget_days", {
  day: date("day").primaryKey(),
  budgetUsd: numeric("budget_usd", { precision: 20, scale: 8 }).notNull(),
  spentUsd: numeric("spent_usd", { precision: 20, scale: 8 }).notNull().default("0"),
  claims: integer("claims").notNull().default(0),
  sightingsOnly: integer("sightings_only").notNull().default(0),
  rejects: integer("rejects").notNull().default(0),
  escalations: integer("escalations").notNull().default(0),
});

export const hunts = pgTable("hunts", {
  day: date("day").primaryKey(),
  brandIds: integer("brand_ids").array().notNull(),
  commitHash: bytea("commit_hash").notNull(),
  salt: bytea("salt"), // conservé côté keeper jusqu'à la révélation
  revealedAt: timestamp("revealed_at", { withTimezone: true }),
});

export const plates = pgTable("plates", {
  id: bigint("id", { mode: "bigint" }).primaryKey(),
  plateId: integer("plate_id").notNull(),
  owner: bytea("owner").notNull(),
  sealedAt: timestamp("sealed_at", { withTimezone: true }).notNull(),
  bonusUsd: numeric("bonus_usd", { precision: 20, scale: 8 }).notNull(),
});

/** Prises validées en attente : contre-angle en cours, ou reçu de prise pour réémission de voucher. */
export const pendingPrises = pgTable("pending_prises", {
  id: text("id").primaryKey(),
  wallet: bytea("wallet").notNull(),
  brandId: integer("brand_id").notNull(),
  sightingId: bigint("sighting_id", { mode: "number" }),
  imageHash: bytea("image_hash").notNull(),
  imageKey: text("image_key").notNull(),
  phash: bytea("phash").notNull(),
  cityCode: integer("city_code").notNull(),
  usdValue: numeric("usd_value", { precision: 20, scale: 8 }).notNull(),
  tokenAmount: numeric("token_amount", { precision: 40, scale: 0 }).notNull(),
  counterAngleDeadline: timestamp("counter_angle_deadline", { withTimezone: true }),
  counterAngleEmbedding: jsonb("counter_angle_embedding"),
  counterAnglePhash: bytea("counter_angle_phash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  lastNonce: bigint("last_nonce", { mode: "bigint" }),
});
