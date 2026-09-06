// Drives the live map in a headless Chrome that behaves like a visible tab (no background throttling),
// because embedded/background tabs never hydrate streamed content. Usage: node scripts/e2e-map.js [baseUrl]
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");

const base = process.argv[2] || "http://localhost:3005";
const candidates = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe")];
const chrome = candidates.find((p) => fs.existsSync(p));
if (!chrome) throw new Error("chrome.exe not found");
const out = path.join(process.env.TEMP || ".", "e2e");
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({ executablePath: chrome, headless: "new", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,900"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 160)); });
  await page.goto(base + "/terrain", { waitUntil: "networkidle2", timeout: 60000 });
  const t0 = Date.now();
  await page.waitForSelector(".maplibregl-canvas", { timeout: 30000 });
  await page.waitForSelector(".livemap-live-on", { timeout: 30000 });
  const tReady = Date.now() - t0;
  await page.evaluate(() => document.querySelector(".livemap-wrap").scrollIntoView({ block: "center" }));
  await new Promise((r) => setTimeout(r, 800));
  const box = await (await page.$(".maplibregl-canvas")).boundingBox();
  await page.screenshot({ path: path.join(out, "map-1-world.png") });
  const iconCount = await page.$$eval(".livemap-pin img", (els) => els.filter((i) => i.complete && i.naturalWidth > 0).length);
  const pinCount = await page.$$eval(".livemap-pin", (els) => els.length);
  const cityCount = await page.$$eval(".livemap-city", (els) => els.length);
  const before = await page.$eval(".livemap-arm", (e) => e.className);
  // one click arms the map, then the wheel zooms it
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.65);
  await new Promise((r) => setTimeout(r, 400));
  const after = await page.$eval(".livemap-arm", (e) => e.className);
  const pageScrollBefore = await page.evaluate(() => window.scrollY);
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel({ deltaY: -240 });
    await new Promise((r) => setTimeout(r, 120));
  }
  await new Promise((r) => setTimeout(r, 2500));
  const pageScrollAfter = await page.evaluate(() => window.scrollY);
  const reset = await page.$eval(".livemap-reset", (e) => e.className);
  await page.screenshot({ path: path.join(out, "map-2-zoomed.png") });
  // leave the map: the wheel must scroll the page again
  await page.mouse.move(10, 10);
  await new Promise((r) => setTimeout(r, 300));
  const disarmed = await page.$eval(".livemap-arm", (e) => e.className);
  // click a pin: street level with 3D buildings
  const pin = await page.$(".livemap-pin");
  const label = await pin.evaluate((e) => e.getAttribute("aria-label"));
  await page.evaluate(() => document.querySelector(".livemap-reset").click());
  await new Promise((r) => setTimeout(r, 2500));
  await pin.click();
  await new Promise((r) => setTimeout(r, 6000));
  await page.screenshot({ path: path.join(out, "map-3-street.png") });
  console.log(JSON.stringify({ tReady, pinCount, iconCount, cityCount, before, after, pageScrollBefore, pageScrollAfter, reset, disarmed, pin: label, errors: errors.slice(0, 6) }, null, 1));
  await browser.close();
})().catch((e) => {
  console.error("E2E FAILED:", e.message);
  process.exit(1);
});
