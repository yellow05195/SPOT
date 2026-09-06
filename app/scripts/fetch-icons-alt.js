// Second pass for brands whose favicon is tiny: icon.horse serves the largest icon it can find.
const fs = require("fs"); const path = require("path");
const root = path.join(__dirname, ".."); const OUT = path.join(root, "public/logos/icons");
const alt = { toyota: "toyota.com", totalenergies: "totalenergies.com", nestle: "nestle.com", costco: "costco.com", amex: "americanexpress.com", homedepot: "homedepot.com", spotify: "open.spotify.com", doordash: "doordash.com", mercedes: "mercedes-benz.com", loreal: "loreal.com", vodafone: "vodafone.com", orange: "orange.com", zalando: "zalando.de", americanairlines: "aa.com", pg: "pg.com", kelloggs: "kelloggs.com", hp: "hp.com", oracle: "oracle.com", cvs: "cvs.com", walgreens: "walgreens.com", bic: "bic.com", continental: "continental.com", honda: "honda.com", byd: "byd.com" };
function pngSize(b) { return b.length > 24 && b.toString("ascii", 1, 4) === "PNG" ? b.readUInt32BE(16) : 0; }
(async () => {
  for (const [slug, domain] of Object.entries(alt)) {
    try {
      const r = await fetch(`https://icon.horse/icon/${domain}`, { headers: { "User-Agent": "Mozilla/5.0 (SPOT icon fetch)" } });
      if (!r.ok) { console.log(slug, "http", r.status); continue; }
      const b = Buffer.from(await r.arrayBuffer()); const ct = r.headers.get("content-type") || "";
      const w = pngSize(b);
      const ext = ct.includes("svg") ? "svg" : ct.includes("jpeg") ? "jpg" : ct.includes("png") || w ? "png" : "ico";
      if (ext === "png" && w < 64) { console.log(slug, "still small", w); continue; }
      for (const e of ["png", "ico", "jpg", "svg"]) { const p = path.join(OUT, slug + "." + e); if (fs.existsSync(p)) fs.unlinkSync(p); }
      fs.writeFileSync(path.join(OUT, slug + "." + ext), b); console.log(slug, "ok", ext, w || b.length);
    } catch (e) { console.log(slug, "err", e.message); }
  }
})();
