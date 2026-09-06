// Records the real product, not a mock-up: three screen captures of the running site (demo mode).
//   1. app-hero.webm   desktop 1920×1080 — the home page, slow scroll to today's hunt
//   2. app-lens.webm   phone 430×932    — the lens: open, frame the truck, shoot, get the card
//   3. app-map.webm    desktop 1920×1080 — the field map, dive into a city in 3D
// The phone camera is fed with a street clip (truck.y4m) through Chrome's fake device flag.
//   node brand/video/record-app.js [baseUrl]   (from the repository root)
const puppeteer = require("../../app/node_modules/puppeteer-core");
const path = require("path");

const base = process.argv[2] || "http://localhost:3005";
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG = require("../../app/node_modules/ffmpeg-static");
const y4m = path.join(__dirname, "truck.y4m");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function desktop(browser, name, url, run) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(1500);
  const rec = await page.screencast({ path: path.join(__dirname, `${name}.webm`), ffmpegPath: FFMPEG });
  await run(page);
  await rec.stop();
  await page.close();
  console.log("recorded", name);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: "new",
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${y4m}`, "--autoplay-policy=no-user-gesture-required", "--window-size=1920,1080"],
  });

  // 1. hero, then a slow scroll down to the hunt
  await desktop(browser, "app-hero", base + "/", async (page) => {
    await sleep(1200);
    await page.evaluate(async () => {
      const target = document.querySelector("#hunt");
      const end = target ? target.getBoundingClientRect().top + window.scrollY - 60 : 900;
      const start = performance.now();
      await new Promise((res) => {
        (function step() {
          const p = Math.min(1, (performance.now() - start) / 2600);
          const e = 1 - Math.pow(1 - p, 3);
          window.scrollTo(0, end * e);
          if (p < 1) requestAnimationFrame(step);
          else res();
        })();
      });
    });
    await sleep(1600);
  });

  // 2. the lens on a phone: open, shoot the truck, earn the card
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument(() => {
      Math.random = () => 0.9; // demo verdicts: always "valid"
    });
    await page.goto(base + "/prise/6", { waitUntil: "networkidle2", timeout: 60000 });
    await sleep(1200);
    const rec = await page.screencast({ path: path.join(__dirname, "app-lens.webm"), ffmpegPath: FFMPEG, scale: 2 });
    await sleep(900);
    const open = await page.$("button ::-p-text(open the lens)");
    if (!open) throw new Error("no 'open the lens' button");
    await open.click();
    await page.waitForSelector(".prise-shutter", { timeout: 20000 });
    await sleep(2600); // let the viewfinder show the street
    await page.click(".prise-shutter");
    await sleep(9000); // capture, analysis, signature, the card
    await rec.stop();
    await page.close();
    console.log("recorded app-lens");
  }

  // 3. the field map: a dive into a city
  await desktop(browser, "app-map", base + "/terrain", async (page) => {
    await page.waitForSelector(".livemap-live-on", { timeout: 30000 });
    await page.evaluate(() => document.querySelector(".livemap-wrap").scrollIntoView({ block: "center" }));
    await sleep(1400);
    const pin = await page.$(".livemap-pin");
    await pin.click();
    await sleep(9500);
  });

  await browser.close();
})().catch((e) => {
  console.error("RECORD FAILED:", e.message);
  process.exit(1);
});
