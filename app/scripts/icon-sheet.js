// Renders every brand icon at map size on one page and screenshots it, to judge them by eye.
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const icons = require(path.join(root, "lib/icons.json"));
const logos = fs.readFileSync(path.join(root, "lib/logos.ts"), "utf8");
const names = [...logos.matchAll(/^  ("?)([^":]+)\1: \{ local: "([a-z0-9]+)"/gm)].map((m) => ({ name: m[2], slug: m[3] }));
const base = process.argv[2] || "http://localhost:3005";
const cells = names.map(({ name, slug }) => {
  const f = icons[slug];
  const src = f ? `${base}/logos/${f}` : "";
  return `<div class="c"><div class="t">${src ? `<img src="${src}">` : "?"}</div><span>${name}<br><i>${f ? f.split(".").pop() : "none"}</i></span></div>`;
}).join("");
const html = `<!doctype html><meta charset=utf-8><style>body{background:#0e0e10;color:#ccc;font:10px system-ui;margin:12px}.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:8px}.c{text-align:center}.t{width:26px;height:26px;border-radius:8px;background:#fff;margin:0 auto 3px;display:grid;place-items:center;overflow:hidden;box-shadow:0 0 0 2px #0e0e10}.t img{width:22px;height:22px;object-fit:contain;padding:2px}i{color:#777}</style><div class=grid>${cells}</div>`;
const file = path.join(process.env.TEMP, "icon-sheet.html");
fs.writeFileSync(file, html);
(async () => {
  const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const browser = await puppeteer.launch({ executablePath: chrome, headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 1400, deviceScaleFactor: 2 });
  await page.goto("file:///" + file.split(String.fromCharCode(92)).join("/"), { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(process.env.TEMP, "icon-sheet.png"), fullPage: true });
  await browser.close();
  console.log("cells", names.length);
})();
