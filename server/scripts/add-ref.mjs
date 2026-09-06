// Adds real photo references for a brand: embeds each image with the server's CLIP and appends the
// vectors to models/refs/<brandId>.json. Once a brand has 5 real photos, its zero-shot text prompts
// are dropped and the image thresholds apply (spec: 20 to 40 hand-picked photos per brand).
//   node scripts/add-ref.mjs <brandId> <photo.jpg> [more photos...]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { OnnxClipEmbedder } from "../dist/vision/clip.js";

const root = path.resolve(import.meta.dirname, "..");
const [, , idArg, ...files] = process.argv;
const id = Number(idArg);
if (!Number.isInteger(id) || files.length === 0) throw new Error("usage: node scripts/add-ref.mjs <brandId> <photo> [photo...]");
const refsDir = path.join(root, "models/refs");
const indexPath = path.join(refsDir, "index.json");
const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : {};
const entry = index[id] ?? { name: String(id), kind: "text" };
const file = path.join(refsDir, `${id}.json`);
let refs = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
if (entry.kind === "text") refs = []; // the first real photos replace the prompts (kept in index for the record)
const embedder = new OnnxClipEmbedder(path.join(root, "models/clip-vision.onnx"));
for (const f of files) {
  const v = Array.from(await embedder.embed(readFileSync(f))).map((x) => Number(x.toFixed(6)));
  refs.push(v);
  console.log(`${entry.name}: +1 reference (${path.basename(f)}), total ${refs.length}`);
}
entry.kind = "image";
entry.images = refs.length;
entry.source = "real photos";
index[id] = entry;
writeFileSync(file, JSON.stringify(refs));
writeFileSync(indexPath, JSON.stringify(index, null, 1));
if (refs.length < 5) console.log("note: fewer than 5 photos; add more before relying on the image thresholds");
