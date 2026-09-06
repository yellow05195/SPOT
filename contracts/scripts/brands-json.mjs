// Builds contracts/brands.json (the admission list) from the catalogue in app/lib/demo.ts.
// The order is the on-chain id order: the server's reference corpus (server/models/refs) is numbered the same way.
//   node contracts/scripts/brands-json.mjs      (from the repository root)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const demo = readFileSync(path.join(root, "app/lib/demo.ts"), "utf8");
const symbols = {};
for (const m of demo.matchAll(/(\d+):\s*"([A-Z0-9.\-]+)"/g)) symbols[m[1]] = m[2];
const out = path.join(root, "contracts/brands.json");
const previous = existsSync(out) ? Object.fromEntries(JSON.parse(readFileSync(out, "utf8")).map((b) => [b.id, b])) : {};
const brands = [];
for (const m of demo.matchAll(/\{\s*id:\s*(\d+),\s*name:\s*"([^"]+)",\s*symbol:[^,]+,\s*sector:\s*(\d+),\s*rarity:\s*([\d.]+)\s*\}/g)) {
  const id = Number(m[1]);
  const keep = previous[id] ?? {};
  brands.push({ id, name: m[2], symbol: symbols[id] ?? null, sector: Number(m[3]), token: keep.token ?? "", priceFeed: keep.priceFeed ?? "" });
}
writeFileSync(out, JSON.stringify(brands, null, 2) + "\n");
console.log(`${brands.length} brands written to contracts/brands.json (token and priceFeed kept from the previous file when present)`);
