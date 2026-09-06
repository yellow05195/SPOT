// Title cards for the teaser (1080×1920): an opening mark, an explainer card, and the closing card.
//   node brand/video/cards.js   (from the repository root)
const puppeteer = require("../../app/node_modules/puppeteer-core");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const mark = "data:image/svg+xml;base64," + Buffer.from(fs.readFileSync(path.join(root, "app/public/logo.svg"), "utf8")).toString("base64");
const fonts = `<link href="https://fonts.googleapis.com/css2?family=Modak&family=Geist:wght@600;700;800&display=swap" rel="stylesheet">`;
const base = `html,body{margin:0;width:1080px;height:1920px;background:#0a0a0b;overflow:hidden;font-family:Geist,system-ui,sans-serif;color:#f5f5f7}
.wrap{position:relative;width:1080px;height:1920px;display:grid;place-items:center;text-align:center;background:radial-gradient(60% 40% at 50% 30%,rgba(255,243,18,.08),transparent 70%),#0a0a0b}
.t{font-family:Modak,system-ui;font-size:150px;line-height:.92;color:#fff;text-shadow:0 6px 0 #8e8e9a,0 20px 40px rgba(0,0,0,.7)}
.t b{display:block;font-weight:400;color:#fff312;text-shadow:0 6px 0 #9a8b00,0 20px 40px rgba(0,0,0,.7)}
.s{font-size:44px;font-weight:600;color:#c2c2c9;line-height:1.35;max-width:820px}
.s span{color:#fff312}
.k{display:inline-flex;align-items:center;gap:14px;padding:18px 30px;border:2px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(18,18,20,.9);font-size:30px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
.k i{width:14px;height:14px;border-radius:50%;background:#fff312;box-shadow:0 0 0 6px rgba(255,243,18,.25)}
.col{display:grid;gap:56px;justify-items:center}`;

const cards = {
  "card-open": `<div class=wrap><div class=col><img src="${mark}" style="width:360px"><div class=t>SPOT</div><div class=k><i></i>every street owns a piece</div></div></div>`,
  "card-how": `<div class=wrap><div class=col><div class=t style="font-size:120px">Photograph<b>a brand.</b></div><div class=s>A van, a can, a car at the lights.<br>Keep the card <span>and a real fragment of its stock.</span></div></div></div>`,
  "card-close": `<div class=wrap><div class=col><img src="${mark}" style="width:300px"><div class=t style="font-size:120px">Every street<b>owns a piece.</b></div><div class=s>Bought in advance. Nothing minted, ever.<br>Robinhood Chain · Stock Tokens</div><div class=k><i></i>SPOT · hunt is live</div></div></div>`,
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  for (const [name, body] of Object.entries(cards)) {
    await page.setContent(`<!doctype html><meta charset=utf-8>${fonts}<style>${base}</style>${body}`, { waitUntil: "load", timeout: 60000 });
    await Promise.race([page.evaluate(() => document.fonts.ready.then(() => true)), new Promise((r) => setTimeout(() => r(false), 8000))]);
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: path.join(__dirname, `${name}.png`) });
    console.log("wrote", name);
  }
  await browser.close();
})();
