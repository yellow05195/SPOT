import { defineConfig } from "drizzle-kit";

/** Migrations are generated from src/db/schema.ts into ./drizzle and applied with `drizzle-kit migrate`. */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://spot:spot@localhost:5432/spot" },
});
