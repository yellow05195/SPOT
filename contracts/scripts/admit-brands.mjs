// Admits the brands of contracts/brands.json on the registry, in id order, one transaction each.
// Brands whose token or price feed is still empty are skipped unless CARDS_ONLY=1, in which case they are
// admitted with addBrandCardsOnly (no asset, no fragment) and get their token and feed later via setBrandAssets. Requires: REGISTRY, RPC_URL, PRIVATE_KEY (the registry owner) and cast.
//   node contracts/scripts/admit-brands.mjs [--from <id>] [--dry]
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const brands = JSON.parse(readFileSync(path.join(root, "contracts/brands.json"), "utf8"));
const { REGISTRY, RPC_URL, PRIVATE_KEY, CARDS_ONLY, CAST = "cast" } = process.env;
const dry = process.argv.includes("--dry");
const fromArg = process.argv.indexOf("--from");
const from = fromArg > -1 ? Number(process.argv[fromArg + 1]) : 1;
if (!dry && (!REGISTRY || !RPC_URL || !PRIVATE_KEY)) {
  console.error("REGISTRY, RPC_URL and PRIVATE_KEY are required (or pass --dry)");
  process.exit(1);
}
let done = 0;
for (const b of brands) {
  if (b.id < from) continue;
  const priced = Boolean(b.token && b.priceFeed);
  if (!priced && CARDS_ONLY !== "1") {
    console.log(`skip ${b.id} ${b.name}: token or price feed missing`);
    continue;
  }
  const call = priced ? ["addBrand(string,address,address,uint16)", b.name, b.token, b.priceFeed, String(b.sector)] : ["addBrandCardsOnly(string,uint16)", b.name, String(b.sector)];
  const args = ["send", REGISTRY ?? "0xREGISTRY", ...call, "--rpc-url", RPC_URL ?? "RPC", "--private-key", dry ? "0xKEY" : PRIVATE_KEY];
  if (dry) {
    console.log(`${CAST} ${args.map((a) => (a.includes(" ") ? JSON.stringify(a) : a)).join(" ")}`);
    continue;
  }
  const r = spawnSync(CAST, args, { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(`FAILED at brand ${b.id} ${b.name}:\n${r.stderr || r.stdout}\nResume with --from ${b.id}`);
    process.exit(1);
  }
  const hash = (r.stdout.match(/transactionHash\s+(0x[0-9a-f]+)/i) ?? [])[1] ?? "";
  console.log(`${b.id} ${b.name} ${hash}`);
  done += 1;
}
console.log(dry ? "dry run" : `${done} brands admitted`);
