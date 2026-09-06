// Builds lib/icons.json: for every logo slug, the best square "profile picture" file we hold.
//   1. an icon file that is crisp (SVG, or PNG/JPG at 96 px or more)
//   2. the official SVG when the mark itself is square-ish (aspect ratio under 1.6)
//   3. whatever icon file is left (small PNG or ICO)
// Run from app/: node scripts/gen-icons.js
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const ICONS = path.join(root, "public/logos/icons");
const LOGOS = path.join(root, "public/logos");
const src = fs.readFileSync(path.join(root, "lib/logos.ts"), "utf8");
const slugs = [...new Set([...src.matchAll(/local: "([a-z0-9]+)"/g)].map((m) => m[1]))];

const pngW = (b) => (b.length > 24 && b.toString("ascii", 1, 4) === "PNG" ? b.readUInt32BE(16) : 0);
function svgAspect(file) {
  const head = fs.readFileSync(file, "utf8").slice(0, 4000);
  const vb = head.match(/viewBox=["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (vb) return Number(vb[1]) / Number(vb[2]);
  const w = head.match(/\swidth=["']([\d.]+)/i);
  const h = head.match(/\sheight=["']([\d.]+)/i);
  if (w && h) return Number(w[1]) / Number(h[1]);
  return 99;
}
// Hand-picked overrides: brands whose favicon is not their recognisable mark.
const PREFER = { cocacola: "cocacola.svg" };
const out = {};
for (const slug of slugs) {
  let icon = null;
  for (const e of ["svg", "png", "jpg", "ico"]) {
    const p = path.join(ICONS, `${slug}.${e}`);
    if (fs.existsSync(p)) {
      icon = { file: `icons/${slug}.${e}`, w: e === "png" ? pngW(fs.readFileSync(p)) : e === "svg" ? 999 : e === "jpg" ? 180 : 0 };
      break;
    }
  }
  const svg = path.join(LOGOS, `${slug}.svg`);
  const squareSvg = fs.existsSync(svg) && svgAspect(svg) < 1.6 ? `${slug}.svg` : null;
  if (PREFER[slug] && fs.existsSync(path.join(LOGOS, PREFER[slug]))) out[slug] = PREFER[slug];
  else if (icon && icon.w >= 96) out[slug] = icon.file;
  else if (squareSvg) out[slug] = squareSvg;
  else if (icon) out[slug] = icon.file;
}
fs.writeFileSync(path.join(root, "lib/icons.json"), JSON.stringify(out, null, 1) + "\n");
const kinds = Object.values(out).reduce((a, f) => ((a[f.split(".").pop() + (f.startsWith("icons/") ? "" : " (mark)")] = (a[f.split(".").pop() + (f.startsWith("icons/") ? "" : " (mark)")] || 0) + 1), a), {});
console.log("icons.json:", Object.keys(out).length, "of", slugs.length, kinds);
