// Downloads the vision models the server needs into MODELS_DIR (default ./models), skipping files
// already there. Node 22 built-ins only (global fetch follows redirects), so it runs inside the
// Docker build as well as on a laptop.
//   node scripts/fetch-models.mjs            (from server/)
//   MODELS_DIR=/app/models node scripts/fetch-models.mjs
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const MODELS = [
  { file: "clip-vision.onnx", url: "https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model.onnx" },
  { file: "face.onnx", url: "https://github.com/onnx/models/raw/main/validated/vision/body_analysis/ultraface/models/version-RFB-320.onnx" },
  { file: "plate.onnx", url: "https://huggingface.co/morsetechlab/yolov11-license-plate-detection/resolve/main/license-plate-finetune-v1n.onnx" },
];

const dir = path.resolve(process.env.MODELS_DIR ?? "./models");
const mb = (n) => `${(n / 1_048_576).toFixed(1)} MB`;

async function size(p) {
  return stat(p).then((s) => s.size, () => null);
}

async function download(url, dest) {
  const tmp = `${dest}.part`;
  await rm(tmp, { force: true });
  const res = await fetch(url, { redirect: "follow", headers: { "user-agent": "spot-server/fetch-models" } });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} ${res.statusText} pour ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  const n = await size(tmp);
  if (!n) throw new Error(`fichier vide reçu pour ${url}`);
  await rename(tmp, dest);
  return n;
}

async function main() {
  await mkdir(dir, { recursive: true });
  let failed = 0;
  for (const m of MODELS) {
    const dest = path.join(dir, m.file);
    const existing = await size(dest);
    if (existing) {
      console.log(`${m.file}: présent (${mb(existing)}), ignoré`);
      continue;
    }
    process.stdout.write(`${m.file}: téléchargement depuis ${m.url} ... `);
    try {
      const n = await download(m.url, dest);
      console.log(`ok (${mb(n)})`);
    } catch (e) {
      failed++;
      console.log("ÉCHEC");
      console.error(`  ${e instanceof Error ? e.message : String(e)}`);
      await rm(`${dest}.part`, { force: true });
    }
  }
  if (failed) {
    console.error(`${failed} modèle(s) manquant(s) dans ${dir}`);
    process.exit(1);
  }
  console.log(`modèles prêts dans ${dir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
