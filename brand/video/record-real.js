// Records a REAL sighting end to end: the app in real mode (port 3007) talks to the real claim
// server (CLIP, parallax, moiré, pHash, voucher signed with the vault's key) and to the local chain
// (anvil, contracts deployed by Scenario.s.sol). The wallet is a minimal injected provider backed by
// one of anvil's unlocked accounts, and the hand tremor comes from synthetic devicemotion events
// (headless Chrome has no accelerometer). Everything else is the production code path.
//   node brand/video/record-real.js [baseUrl] [brandId]   (from the repository root)
const puppeteer = require("../../app/node_modules/puppeteer-core");
const path = require("path");
const FFMPEG = require("../../app/node_modules/ffmpeg-static");

const base = process.argv[2] || "http://localhost:3007";
const brandId = process.argv[3] || "2"; // Tesla on the local chain
const RPC = "http://127.0.0.1:8547";
const PLAYER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"; // anvil account 2, unlocked
const y4m = path.join(__dirname, "truck.y4m");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${y4m}`, "--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const logs = [];
  page.on("console", (m) => { if (["error", "warn"].includes(m.type())) logs.push(m.type() + ": " + m.text().slice(0, 160)); });
  page.on("response", (r) => { if (r.url().includes(":3001/")) logs.push(`api ${r.status()} ${new URL(r.url()).pathname}`); });

  await page.evaluateOnNewDocument((rpc, player) => {
    // 1. a tiny EIP-1193 wallet: reads go to the node, sends are executed by anvil's unlocked account
    const call = async (method, params) => {
      const res = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params: params ?? [] }) });
      const j = await res.json();
      if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code });
      return j.result;
    };
    const listeners = {};
    window.ethereum = {
      isMetaMask: true,
      isSpotTestWallet: true,
      request: async ({ method, params }) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [player];
        if (method === "eth_chainId") return "0x1237";
        if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
        if (method === "wallet_getPermissions" || method === "wallet_requestPermissions") return [{ parentCapability: "eth_accounts" }];
        if (method === "eth_sendTransaction") {
          const tx = { ...params[0], from: player };
          delete tx.gas;
          return call("eth_sendTransaction", [tx]);
        }
        return call(method, params);
      },
      on: (ev, fn) => ((listeners[ev] = listeners[ev] || []).push(fn), undefined),
      removeListener: (ev, fn) => { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); },
    };
    // 2. a hand that is never perfectly still: white-noise tremor on the accelerometer and gyroscope, 30 Hz
    const gauss = () => { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    setInterval(() => {
      const ev = new DeviceMotionEvent("devicemotion", {
        accelerationIncludingGravity: { x: 0.3 + gauss() * 0.12, y: 9.6 + gauss() * 0.12, z: 1.1 + gauss() * 0.12 },
        rotationRate: { alpha: gauss() * 2.5, beta: gauss() * 2.5, gamma: gauss() * 2.5 },
        interval: 33,
      });
      window.dispatchEvent(ev);
    }, 33);
  }, RPC, PLAYER);

  await page.goto(`${base}/prise/${brandId}`, { waitUntil: "networkidle2", timeout: 90000 });
  await sleep(1500);
  const rec = await page.screencast({ path: path.join(__dirname, "real-lens.webm"), ffmpegPath: FFMPEG, scale: 2 });
  await sleep(800);
  // connect the wallet if the page asks for it
  const connect = await page.$("button ::-p-text(sign the notebook)");
  if (connect) { await connect.click(); await sleep(1500); }
  const open = await page.$("button ::-p-text(open the lens)");
  if (!open) { await rec.stop(); throw new Error("no 'open the lens' button: " + (await page.evaluate(() => document.body.innerText.slice(0, 300)))); }
  await open.click();
  await page.waitForSelector(".prise-shutter", { timeout: 30000 });
  await sleep(2600);
  await page.click(".prise-shutter");
  // capture (1.5 s), upload, the six layers on the server, the voucher, the on-chain claim, the card
  const t0 = Date.now();
  let phaseText = "";
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    phaseText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 400));
    if (/in the notebook|The card is yours|rejected|refused|not recognised|not recognized|try again|expired|answered/i.test(phaseText)) break;
  }
  await sleep(3500);
  await rec.stop();
  const result = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 600));
  await browser.close();
  console.log(JSON.stringify({ seconds: Math.round((Date.now() - t0) / 1000), result, logs: logs.slice(-14) }, null, 1));
})().catch((e) => {
  console.error("REAL RECORD FAILED:", e.message);
  process.exit(1);
});
