// Sanity check of the real vision stack: embeds a photo with the ONNX CLIP the server uses and
// scores it against every brand's reference corpus. Prints the top matches and the decision band.
//   node scripts/check-vision.mjs <image> [expectedBrandName]
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { OnnxClipEmbedder, scoreAgainstRefs, decide } from "../dist/vision/clip.js";

const root = path.resolve(import.meta.dirname, "..");
const [, , file, expected] = process.argv;
if (!file) throw new Error("usage: node scripts/check-vision.mjs <image> [brand]");
const index = JSON.parse(readFileSync(path.join(root, "models/refs/index.json"), "utf8"));
const embedder = new OnnxClipEmbedder(path.join(root, "models/clip-vision.onnx"));
const t0 = Date.now();
const emb = await embedder.embed(readFileSync(file));
const tEmbed = Date.now() - t0;
const scores = [];
for (const f of readdirSync(path.join(root, "models/refs"))) {
  if (!/^\d+\.json$/.test(f)) continue;
  const id = Number(f.replace(".json", ""));
  const refs = JSON.parse(readFileSync(path.join(root, "models/refs", f), "utf8"));
  scores.push({ id, name: index[id]?.name ?? String(id), score: scoreAgainstRefs(emb, refs) });
}
scores.sort((a, b) => b.score - a.score);
console.log(`embed: ${tEmbed} ms, dim ${emb.length}`);
for (const s of scores.slice(0, 8)) console.log(`${s.score.toFixed(3)}  ${s.name}  → ${decide(s.score)}`);
if (expected) {
  const hit = scores.find((s) => s.name.toLowerCase() === expected.toLowerCase());
  const rank = scores.findIndex((s) => s === hit) + 1;
  console.log(`expected ${expected}: score ${hit?.score.toFixed(3)} rank ${rank} → ${hit ? decide(hit.score) : "?"}`);
}
