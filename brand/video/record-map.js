// The map dive as a frame-by-frame render: the camera is placed for each frame, the tiles are
// allowed to load, and the frame is captured. Output: app-map.mp4 (1920×1080, 24 fps, ~5.5 s).
//   node brand/video/record-map.js [baseUrl]   (from the repository root)
const puppeteer = require("../../app/node_modules/puppeteer-core");
const ffmpeg = require("../../app/node_modules/ffmpeg-static");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const base = process.argv[2] || "http://localhost:3005";
const framesDir = path.join(__dirname, "map-frames");
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir);
const FPS = 24;
const HOLD = 0.9; // seconds on the world before the dive
const DIVE = 3.4; // seconds of flight
const TAIL = 1.2; // seconds holding the street view
const ease = (p) => 1 - Math.pow(1 - p, 3);

(async () => {
  const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1920,1080"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(base + "/terrain", { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector(".livemap-live-on", { timeout: 30000 });
  await page.waitForFunction(() => !!window.__spotMap, { timeout: 30000 });
  await page.evaluate(() => document.querySelector(".livemap-wrap").scrollIntoView({ block: "center" }));
  const rect = await page.evaluate(() => { const r = document.querySelector(".livemap-wrap").getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; });
  console.log("map rect", rect);
  await page.evaluate(() => {
    const st = document.createElement("style");
    st.textContent = ".livemap-arm,.livemap-hint,.maplibregl-ctrl-attrib{display:none!important}";
    document.head.appendChild(st);
  });
  const target = { center: [-74.01, 40.71], zoom: 16.4, pitch: 62, bearing: -18 }; // New York
  const world = { center: [12, 22], zoom: 1.15, pitch: 0, bearing: 0 };
  const settle = () => page.evaluate(() => new Promise((res) => { const m = window.__spotMap; const t0 = Date.now(); requestAnimationFrame(() => { const check = () => { if ((m.areTilesLoaded() && !m.isMoving() && m.loaded()) || Date.now() - t0 > 9000) return setTimeout(res, 60); setTimeout(check, 60); }; setTimeout(check, 80); }); }));
  const mapEl = await page.$(".livemap-wrap");
  const total = Math.round((HOLD + DIVE + TAIL) * FPS);
  for (let f = 0; f < total; f++) {
    const s = f / FPS;
    let cam;
    if (s < HOLD) cam = world;
    else if (s < HOLD + DIVE) {
      const p = (s - HOLD) / DIVE;
      const lerp = (a, b, q) => a + (b - a) * q;
      if (p < 0.28) {
        // first glide the centre onto the city while barely zooming, so the flight stays over land
        const q = ease(p / 0.28);
        cam = { center: [lerp(world.center[0], target.center[0], q), lerp(world.center[1], target.center[1], q)], zoom: lerp(world.zoom, 3.6, q), pitch: 0, bearing: 0 };
      } else {
        const q = ease((p - 0.28) / 0.72);
        cam = { center: target.center, zoom: lerp(3.6, target.zoom, q), pitch: target.pitch * Math.max(0, (q - 0.5) / 0.5), bearing: target.bearing * q };
      }
    } else cam = target;
    await page.evaluate((c) => window.__spotMap.jumpTo(c), cam);
    await settle();
    await mapEl.screenshot({ path: path.join(framesDir, `f${String(f).padStart(4, "0")}.png`) });
    if (f % 24 === 0) console.log(`frame ${f}/${total}`);
  }
  await browser.close();
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(framesDir, "f%04d.png"), "-vf", "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080", "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", path.join(__dirname, "app-map.mp4")]);
  console.log("wrote app-map.mp4", (total / FPS).toFixed(1), "s");
})().catch((e) => {
  console.error("MAP RECORD FAILED:", e.message);
  process.exit(1);
});
