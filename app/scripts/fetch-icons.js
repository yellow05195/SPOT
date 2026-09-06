// Square "profile picture" icons for every brand: the brand's own app icon / favicon at the largest
// size the favicon services hold. Saved as public/logos/icons/<slug>.png. Run from app/: node scripts/fetch-icons.js
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const OUT = path.join(root, "public/logos/icons");
fs.mkdirSync(OUT, { recursive: true });

const src = fs.readFileSync(path.join(root, "lib/logos.ts"), "utf8");
const entries = [...src.matchAll(/local: "([a-z0-9]+)", domain: "([^"]+)"/g)].map((m) => ({ slug: m[1], domain: m[2] }));

function pngSize(buf) {
  if (buf.length < 24 || buf.toString("ascii", 1, 4) !== "PNG") return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
async function fetchBuf(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (SPOT icon fetch)" } });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}
async function one({ slug, domain }) {
  const dest = path.join(OUT, slug + ".png");
  // 1. Google's favicon service at 256 px (returns the largest icon it holds, upscaled if tiny)
  let best = null;
  const g = await fetchBuf(`https://www.google.com/s2/favicons?domain=${domain}&sz=256`);
  if (g) {
    const s = pngSize(g);
    best = { buf: g, w: s ? s.w : 0, from: "google" };
  }
  // 2. DuckDuckGo's icon store, often a crisper source (ICO/PNG)
  if (!best || best.w < 128) {
    const d = await fetchBuf(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
    if (d && d.length > 800) {
      const s = pngSize(d);
      const w = s ? s.w : d.length > 20000 ? 256 : 64;
      if (!best || w > best.w) best = { buf: d, w, from: "ddg", ico: !s };
    }
  }
  if (!best) return `${slug}: none`;
  fs.writeFileSync(best.ico ? dest.replace(/\.png$/, ".ico") : dest, best.buf);
  return `${slug}: ${best.from} ${best.w}px`;
}
(async () => {
  const lines = [];
  for (let i = 0; i < entries.length; i += 6) {
    const batch = entries.slice(i, i + 6);
    lines.push(...(await Promise.all(batch.map(one))));
  }
  fs.writeFileSync(path.join(root, "scripts/icons-report.txt"), lines.join("\n"));
  const small = lines.filter((l) => / (\d+)px/.test(l) && Number(l.match(/ (\d+)px/)[1]) < 64);
  console.log("icons:", lines.length, "| small (<64px):", small.length);
  console.log(small.join("\n"));
})();
