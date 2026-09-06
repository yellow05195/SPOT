// Builds the zero-shot reference corpus: models/refs/<brandId>.json = CLIP text embeddings of
// "a photo of a <brand> <thing>" prompts, in the same space as the image encoder the server runs.
// Real street photos per brand (20 to 40, hand-picked) should replace or extend these after the
// field test; until then this lets recognition work everywhere from day one.
//   node scripts/build-refs.mjs            (from server/)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { AutoTokenizer, CLIPTextModelWithProjection } from "@huggingface/transformers";

const root = path.resolve(import.meta.dirname, "..");
const demo = readFileSync(path.join(root, "../app/lib/demo.ts"), "utf8");
const brands = [...demo.matchAll(/\{ id: (\d+), name: "([^"]+)", symbol: SYMBOLS\[\d+\] \?\? null, sector: (\d+)/g)].map((m) => ({ id: Number(m[1]), name: m[2], sector: Number(m[3]) }));

// what each sector's brand looks like in the street
const THINGS = {
  1: ["delivery van", "delivery truck", "cargo ship container", "parcel box", "courier uniform", "logo on a truck"],
  2: ["can", "bottle", "vending machine", "café storefront", "logo on a fridge", "cup"],
  3: ["car", "car badge on a vehicle", "car dealership sign", "motorcycle", "logo on a car", "scooter"],
  4: ["store sign", "billboard", "phone", "laptop", "logo on a shop window", "product box"],
  5: ["gas station", "fuel pump", "gas station sign", "logo on a tanker truck", "petrol station canopy", "sign"],
  6: ["restaurant sign", "storefront", "food packaging", "delivery bag", "menu board", "logo on a building"],
  7: ["storefront", "shopping bag", "store sign", "supermarket entrance", "logo on a building", "parking lot sign"],
  8: ["bank branch", "ATM", "credit card", "bank sign", "logo on a building", "office building sign"],
  9: ["shoe", "storefront", "shopping bag", "clothing label", "logo on a t-shirt", "store sign"],
  10: ["product package", "supermarket shelf", "logo on a bottle", "store display", "toothpaste box", "sign"],
  11: ["airplane", "hotel sign", "airport counter", "hotel entrance", "logo on a plane tail", "sign"],
  12: ["excavator", "tractor", "airplane", "factory sign", "logo on a machine", "construction site"],
};
const GENERIC = ["logo in the street", "sign on a building", "brand logo photographed outdoors", "logo on a vehicle"];

const tokenizer = await AutoTokenizer.from_pretrained("Xenova/clip-vit-base-patch32");
const model = await CLIPTextModelWithProjection.from_pretrained("Xenova/clip-vit-base-patch32", { dtype: "fp32" });

const out = path.join(root, "models/refs");
mkdirSync(out, { recursive: true });
const index = {};
for (const b of brands) {
  const things = [...(THINGS[b.sector] ?? []), ...GENERIC];
  const prompts = things.map((t) => `a photo of a ${b.name} ${t}`);
  const inputs = tokenizer(prompts, { padding: true, truncation: true });
  const { text_embeds } = await model(inputs);
  const [n, dim] = text_embeds.dims;
  const refs = [];
  for (let i = 0; i < n; i++) {
    const v = Array.from(text_embeds.data.slice(i * dim, (i + 1) * dim));
    const norm = Math.hypot(...v) || 1;
    refs.push(v.map((x) => Number((x / norm).toFixed(6))));
  }
  writeFileSync(path.join(out, `${b.id}.json`), JSON.stringify(refs));
  index[b.id] = { name: b.name, sector: b.sector, kind: "text", prompts: prompts.length, source: "zero-shot text prompts" };
}
writeFileSync(path.join(out, "index.json"), JSON.stringify(index, null, 1));
console.log(`refs written for ${brands.length} brands in ${out}`);
