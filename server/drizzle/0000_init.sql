CREATE TABLE "accounts" (
	"wallet" "bytea" PRIMARY KEY NOT NULL,
	"first_seen" timestamp with time zone NOT NULL,
	"risk" smallint DEFAULT 0 NOT NULL,
	"risk_updated_at" timestamp with time zone,
	"subscriber" boolean DEFAULT false NOT NULL,
	"device_fp" text[] DEFAULT '{}' NOT NULL,
	"last_country" text,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"symbol" text,
	"token" "bytea" NOT NULL,
	"price_feed" "bytea" NOT NULL,
	"sector" smallint NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"rarity" numeric(6, 3) DEFAULT '1.000' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_days" (
	"day" date PRIMARY KEY NOT NULL,
	"budget_usd" numeric(20, 8) NOT NULL,
	"spent_usd" numeric(20, 8) DEFAULT '0' NOT NULL,
	"claims" integer DEFAULT 0 NOT NULL,
	"sightings_only" integer DEFAULT 0 NOT NULL,
	"rejects" integer DEFAULT 0 NOT NULL,
	"escalations" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hunts" (
	"day" date PRIMARY KEY NOT NULL,
	"brand_ids" integer[] NOT NULL,
	"commit_hash" "bytea" NOT NULL,
	"salt" "bytea",
	"revealed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pending_prises" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet" "bytea" NOT NULL,
	"brand_id" integer NOT NULL,
	"sighting_id" bigint,
	"image_hash" "bytea" NOT NULL,
	"image_key" text NOT NULL,
	"phash" "bytea" NOT NULL,
	"city_code" integer NOT NULL,
	"usd_value" numeric(20, 8) NOT NULL,
	"token_amount" numeric(40, 0) NOT NULL,
	"counter_angle_deadline" timestamp with time zone,
	"counter_angle_embedding" jsonb,
	"counter_angle_phash" "bytea",
	"created_at" timestamp with time zone NOT NULL,
	"last_nonce" bigint
);
--> statement-breakpoint
CREATE TABLE "plates" (
	"id" bigint PRIMARY KEY NOT NULL,
	"plate_id" integer NOT NULL,
	"owner" "bytea" NOT NULL,
	"sealed_at" timestamp with time zone NOT NULL,
	"bonus_usd" numeric(20, 8) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sightings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"wallet" "bytea" NOT NULL,
	"brand_id" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"phash" "bytea" NOT NULL,
	"bg_phash" "bytea",
	"image_key" text NOT NULL,
	"image_hash" "bytea" NOT NULL,
	"city_code" integer,
	"city_label" text,
	"in_hunt" boolean NOT NULL,
	"rarity_at" numeric(6, 3) NOT NULL,
	"usd_value" numeric(20, 8) NOT NULL,
	"paid" boolean,
	"nonce" bigint,
	"tx_claim" "bytea",
	"vision_score" real NOT NULL,
	"escalated" boolean NOT NULL,
	"risk_at" smallint NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "sightings_nonce_unique" UNIQUE("nonce")
);
--> statement-breakpoint
ALTER TABLE "sightings" ADD CONSTRAINT "sightings_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sightings_phash_idx" ON "sightings" USING hash ("phash");--> statement-breakpoint
CREATE INDEX "sightings_wallet_created_idx" ON "sightings" USING btree ("wallet","created_at");--> statement-breakpoint
CREATE TABLE "media" (
	"key" text PRIMARY KEY NOT NULL,
	"body" "bytea" NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
