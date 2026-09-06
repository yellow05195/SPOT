// A transparent phone bezel (1080 px tall) to frame the real screen recording inside the 16:9 cut.
//   node brand/video/bezel.js   (from the repository root)
const puppeteer = require("../../app/node_modules/puppeteer-core");
const path = require("path");
const W = 468, H = 1014, R = 48, B = 0; // the screen itself, rounded; no fake bezel // outer size, corner radius, bezel thickness
const html = `<!doctype html><style>html,body{margin:0;background:transparent}
.m{position:absolute;left:0;top:0;width:${W}px;height:${H}px;border-radius:${R}px;background:#fff}
.r{position:absolute;left:0;top:0;width:${W}px;height:${H}px;box-sizing:border-box;border-radius:${R}px;border:1.5px solid rgba(255,255,255,.28);box-shadow:0 30px 80px rgba(0,0,0,.65)}
</style><div class=m></div>`;
const rim = `<!doctype html><style>html,body{margin:0;background:transparent}
.r{position:absolute;left:0;top:0;width:${W + 4}px;height:${H + 4}px;box-sizing:border-box;border-radius:${R + 2}px;border:2px solid rgba(255,255,255,.32);box-shadow:0 30px 80px rgba(0,0,0,.7)}
</style><div class=r></div>`;
(async () => {
  const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: W + 4, height: H + 4, deviceScaleFactor: 2 });
  await page.setContent(html);
  await page.screenshot({ path: path.join(__dirname, "mask.png"), omitBackground: true });
  await page.setContent(rim);
  await page.screenshot({ path: path.join(__dirname, "rim.png"), omitBackground: true });
  await browser.close();
  console.log("mask.png + rim.png", W, H);
})();
