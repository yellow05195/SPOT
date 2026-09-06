// Splices scripts/brands-extra.js into lib/logos.ts (LOGOS + NO_LOCAL) and lib/demo.ts (SYMBOLS + brands).
// Run from app/: node scripts/gen-brands.js
const fs = require("fs");
const path = require("path");
const B = require("./brands-extra.js");
const root = path.join(__dirname, "..");
const have = new Set(
  fs
    .readdirSync(path.join(root, "public/logos"))
    .filter((f) => f.endsWith(".svg"))
    .map((f) => f.replace(/\.svg$/, "")),
);
const key = (n) => (/^[A-Za-z][A-Za-z0-9]*$/.test(n) ? n : JSON.stringify(n));

let lg = fs.readFileSync(path.join(root, "lib/logos.ts"), "utf8");
if (!lg.includes("Walmart")) {
  const entries = B.map(([n, , , , slug, domain, dark, wide]) => `  ${key(n)}: { local: "${slug}", domain: "${domain}"${dark ? ", dark: true" : ""}${wide ? ", wide: true" : ""} },`).join("\n");
  lg = lg.replace(/(  Inditex: \{[^\n]*\n)\};/, `$1${entries}\n};`);
}
const localOf = (n) => {
  const m = lg.match(new RegExp(`  ${key(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: \\{ local: "([a-z0-9]+)"`));
  return m ? m[1] : null;
};
const oldNames = ["Monster", "Starbucks", "Shell", "TotalEnergies", "BP"];
const missing = oldNames.concat(B.map(([n]) => n)).filter((n) => {
  const l = localOf(n);
  return l && !have.has(l);
});
lg = lg.replace(/const NO_LOCAL = new Set\(\[[^\]]*\]\);/, `const NO_LOCAL = new Set(${JSON.stringify(missing)});`);
fs.writeFileSync(path.join(root, "lib/logos.ts"), lg);

let d = fs.readFileSync(path.join(root, "lib/demo.ts"), "utf8");
if (!d.includes('"Walmart"')) {
  const syms = B.map(([, s], i) => `${21 + i}: "${s}"`).join(", ");
  d = d.replace(/(const SYMBOLS: Record<number, string> = \{[^}]*?)20: "NKE" \};/, `$120: "NKE", ${syms} };`);
  const rows = B.map(([n, , sector, rarity], i) => `  { id: ${21 + i}, name: ${JSON.stringify(n)}, symbol: SYMBOLS[${21 + i}] ?? null, sector: ${sector}, rarity: ${rarity} },`).join("\n");
  d = d.replace(/(  \{ id: 20, name: "Nike"[^\n]*\n)\];/, `$1${rows}\n];`);
  fs.writeFileSync(path.join(root, "lib/demo.ts"), d);
}
console.log("brands added:", B.length, "| without a local logo:", missing.join(", ") || "none");
