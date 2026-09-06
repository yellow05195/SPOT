// Third pass: the brand's own apple-touch-icon (the real "app icon", usually 180 px) read from its
// home page, for every brand whose stored icon is still an .ico or a PNG under 128 px.
// Run from app/: node scripts/fetch-icons-touch.js
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const OUT = path.join(root, "public/logos/icons");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const src = fs.readFileSync(path.join(root, "lib/logos.ts"), "utf8");
const entries = [...src.matchAll(/local: "([a-z0-9]+)", domain: "([^"]+)"/g)].map((m) => ({ slug: m[1], domain: m[2] }));

const pngW = (b) => (b.length > 24 && b.toString("ascii", 1, 4) === "PNG" ? b.readUInt32BE(16) : 0);
const current = (slug) => {
  for (const e of ["png", "jpg", "svg", "ico"]) {
    const p = path.join(OUT, `${slug}.${e}`);
    if (fs.existsSync(p)) return { p, e, w: e === "png" ? pngW(fs.readFileSync(p)) : e === "ico" ? 0 : 256 };
  }
  return null;
};
async function get(url, asText) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, redirect: "follow", signal: ctl.signal });
    if (!r.ok) return null;
    return asText ? { text: await r.text(), url: r.url } : { buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get("content-type") || "", url: r.url };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
function pickIcon(html, base) {
  const links = [...html.matchAll(/<link[^>]+>/gi)].map((m) => m[0]);
  let best = null;
  for (const l of links) {
    const rel = (l.match(/rel=["']([^"']+)["']/i) || [])[1] || "";
    const href = (l.match(/href=["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    let score = 0;
    if (/apple-touch-icon/i.test(rel)) score = 180;
    else if (/\bicon\b/i.test(rel)) score = 32;
    else continue;
    const sizes = (l.match(/sizes=["'](\d+)x/i) || [])[1];
    if (sizes) score = Number(sizes);
    if (/\.svg(\?|$)/i.test(href)) score = Math.max(score, 200);
    if (/\.ico(\?|$)/i.test(href)) score = Math.min(score, 16);
    if (!best || score > best.score) best = { href, score };
  }
  if (!best) return null;
  try {
    return { url: new URL(best.href, base).href, score: best.score };
  } catch {
    return null;
  }
}
async function one({ slug, domain }) {
  const cur = current(slug);
  if (cur && cur.e !== "ico" && cur.w >= 128) return `${slug}: kept ${cur.e} ${cur.w}`;
  for (const host of [`https://www.${domain}/`, `https://${domain}/`]) {
    const page = await get(host, true);
    if (!page) continue;
    const icon = pickIcon(page.text, page.url);
    if (!icon || icon.score < 64) continue;
    const f = await get(icon.url, false);
    if (!f || f.buf.length < 500) continue;
    const isSvg = f.type.includes("svg") || f.buf.slice(0, 200).toString().includes("<svg");
    const w = pngW(f.buf);
    const ext = isSvg ? "svg" : w ? "png" : f.type.includes("jpeg") ? "jpg" : null;
    if (!ext || (ext === "png" && w < 96)) continue;
    if (cur) fs.unlinkSync(cur.p);
    fs.writeFileSync(path.join(OUT, `${slug}.${ext}`), f.buf);
    return `${slug}: touch ${ext} ${w || icon.score} <- ${icon.url}`;
  }
  return `${slug}: no better (${cur ? cur.e + " " + cur.w : "none"})`;
}
(async () => {
  const out = [];
  for (let i = 0; i < entries.length; i += 8) out.push(...(await Promise.all(entries.slice(i, i + 8).map(one))));
  fs.writeFileSync(path.join(root, "scripts/icons-touch-report.txt"), out.join("\n"));
  console.log(out.filter((l) => !/: kept/.test(l)).join("\n"));
})();
