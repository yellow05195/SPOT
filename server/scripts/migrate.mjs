// Boot-time migration: applies drizzle/0000_init.sql to DATABASE_URL when the schema is not there
// yet. Idempotent: if the `sightings` table already exists, only the additive IF NOT EXISTS steps run.
// Without DATABASE_URL (dev, memory repos) it does nothing and exits 0, so the same entrypoint
// works everywhere. Uses postgres.js, the client the server already depends on.
//   node scripts/migrate.mjs            (from server/)
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL absente : pas de migration (dépôts en mémoire)");
  process.exit(0);
}

const root = path.resolve(import.meta.dirname, "..");
const file = path.join(root, "drizzle", "0000_init.sql");
const SENTINEL_TABLE = "sightings";
// Tables added after the first release, safe to run on every boot (IF NOT EXISTS).
const ENSURE = [
  `CREATE TABLE IF NOT EXISTS "media" ("key" text PRIMARY KEY NOT NULL, "body" bytea NOT NULL, "content_type" text NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL)`,
];

const sql = postgres(url, { max: 1, onnotice: () => undefined });
try {
  const [row] = await sql`SELECT to_regclass(${"public." + SENTINEL_TABLE}) AS present`;
  if (row?.present) {
    // the base schema is there: only the additive, idempotent steps below
    for (const s of ENSURE) await sql.unsafe(s);
    console.log("schema present, additive steps applied");
    process.exit(0);
  }
  const statements = readFileSync(file, "utf8")
    .split(/-->\s*statement-breakpoint/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  console.log(`schéma absent : application de ${path.relative(root, file)} (${statements.length} instructions)`);
  await sql.begin(async (tx) => {
    for (const s of statements) await tx.unsafe(s);
  });
  console.log("schema applied");
} catch (e) {
  console.error("migration échouée :", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
