import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Couche 4, étage 1 (spec 4.4) — CLIP local, gratuit, sur CPU.
 * L'embedding de l'image est comparé aux embeddings de référence de la marque (20 à 40 images de
 * référence par marque, constituées à la main : `models/refs/<brandId>.json`).
 *
 *   similarité > 0,82  → accepté sans escalade
 *   similarité < 0,55  → rejeté sans escalade
 *   entre les deux     → escalade
 */

// Field calibration (2026-09-06, first real references): a matching photo scores ~0.79 against 15 real
// Tesla photos, unrelated street photos 0.41-0.55. 0.72 keeps a clear margin; re-tune on the 200-photo panel.
export const ACCEPT_THRESHOLD = 0.72;
export const REJECT_THRESHOLD = 0.55;
export const SAME_OBJECT_THRESHOLD = 0.6; // contre-angle : les deux clichés montrent le même objet

export interface Embedder {
  embed(image: Buffer): Promise<Float32Array>;
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += (v[i] as number) ** 2;
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = (v[i] as number) / n;
  return out;
}

export type VisionDecision = "accept" | "reject" | "escalate";

export function decide(similarity: number): VisionDecision {
  if (similarity > ACCEPT_THRESHOLD) return "accept";
  if (similarity < REJECT_THRESHOLD) return "reject";
  return "escalate";
}

/** Score = moyenne des 3 meilleures similarités : robuste à une référence atypique. */
export function scoreAgainstRefs(embedding: ArrayLike<number>, refs: ArrayLike<number>[]): number {
  if (refs.length === 0) return 0;
  const sims = refs.map((r) => cosine(embedding, r)).sort((a, b) => b - a);
  const top = sims.slice(0, Math.min(3, sims.length));
  return top.reduce((a, b) => a + b, 0) / top.length;
}

export interface ReferenceCorpus {
  refs(brandId: number): Promise<ArrayLike<number>[]>;
  /** true when a brand only has text-prompt references (zero-shot): scores live in another band and need a margin */
  zeroShot?(brandId: number): Promise<boolean>;
  /** best score of the same embedding against every other brand, for the zero-shot margin */
  bestOtherScore?(embedding: ArrayLike<number>, brandId: number): Promise<number>;
}

/**
 * Zero-shot band (text references): CLIP text/image similarities sit around 0.20-0.32, so the absolute
 * thresholds of the image corpus do not apply. The brand must stand out from the other brands.
 * The middle band still goes to the model, which is the real judge until real photo references exist.
 */
export const ZS_ACCEPT_SCORE = 0.27;
export const ZS_ACCEPT_MARGIN = 0.02;
export const ZS_REJECT_SCORE = 0.2;
export const ZS_REJECT_MARGIN = -0.02;
export function decideZeroShot(score: number, bestOther: number): VisionDecision {
  const margin = score - bestOther;
  if (score >= ZS_ACCEPT_SCORE && margin >= ZS_ACCEPT_MARGIN) return "accept";
  if (score < ZS_REJECT_SCORE || margin < ZS_REJECT_MARGIN) return "reject";
  return "escalate";
}

/** Corpus sur disque : `models/refs/<brandId>.json` = number[][] (embeddings normalisés). */
export class FileReferenceCorpus implements ReferenceCorpus {
  private cache = new Map<number, number[][]>();
  private index: Record<string, { kind?: string }> | null = null;
  constructor(private readonly dir: string) {}

  private async loadIndex(): Promise<Record<string, { kind?: string }>> {
    if (!this.index) {
      try {
        this.index = JSON.parse(await readFile(path.join(this.dir, "refs", "index.json"), "utf8")) as Record<string, { kind?: string }>;
      } catch {
        this.index = {};
      }
    }
    return this.index;
  }

  async zeroShot(brandId: number): Promise<boolean> {
    const idx = await this.loadIndex();
    return idx[String(brandId)]?.kind === "text";
  }

  async bestOtherScore(embedding: ArrayLike<number>, brandId: number): Promise<number> {
    const idx = await this.loadIndex();
    let best = -1;
    for (const key of Object.keys(idx)) {
      const id = Number(key);
      if (!Number.isInteger(id) || id === brandId) continue;
      const s = scoreAgainstRefs(embedding, await this.refs(id));
      if (s > best) best = s;
    }
    return best;
  }

  async refs(brandId: number): Promise<number[][]> {
    const cached = this.cache.get(brandId);
    if (cached) return cached;
    try {
      const raw = await readFile(path.join(this.dir, "refs", `${brandId}.json`), "utf8");
      const parsed = JSON.parse(raw) as number[][];
      this.cache.set(brandId, parsed);
      return parsed;
    } catch {
      return [];
    }
  }
}

export class MemoryReferenceCorpus implements ReferenceCorpus {
  constructor(private readonly data: Map<number, number[][]>) {}
  async refs(brandId: number): Promise<number[][]> {
    return this.data.get(brandId) ?? [];
  }
}

/**
 * Encodeur d'image CLIP (ViT-B/32) exporté en ONNX : entrée `pixel_values` 1×3×224×224, normalisation
 * CLIP, sortie `image_embeds` (512). Les poids ne sont pas dans le dépôt : `models/clip-vision.onnx`.
 */
export class OnnxClipEmbedder implements Embedder {
  private session: Promise<OrtSession> | null = null;
  constructor(private readonly modelPath: string) {}

  private async load(): Promise<OrtSession> {
    if (!this.session) {
      this.session = (async () => {
        const ort = (await import("onnxruntime-node")) as unknown as OrtModule;
        return ort.InferenceSession.create(this.modelPath, { executionProviders: ["cpu"] });
      })();
    }
    return this.session;
  }

  async embed(image: Buffer): Promise<Float32Array> {
    const ort = (await import("onnxruntime-node")) as unknown as OrtModule;
    const session = await this.load();
    const { data } = await sharp(image).resize(224, 224, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const mean = [0.48145466, 0.4578275, 0.40821073];
    const std = [0.26862954, 0.26130258, 0.27577711];
    const tensor = new Float32Array(3 * 224 * 224);
    for (let i = 0; i < 224 * 224; i++) {
      for (let c = 0; c < 3; c++) {
        tensor[c * 224 * 224 + i] = ((data[i * 3 + c] as number) / 255 - (mean[c] as number)) / (std[c] as number);
      }
    }
    const inputName = session.inputNames[0] ?? "pixel_values";
    const out = await session.run({ [inputName]: new ort.Tensor("float32", tensor, [1, 3, 224, 224]) });
    const first = out[session.outputNames[0] ?? "image_embeds"];
    if (!first) throw new Error("CLIP : sortie absente");
    return normalize(new Float32Array(first.data as Float32Array));
  }
}

interface OrtTensor {
  data: Float32Array | ArrayLike<number>;
  dims: readonly number[];
}
interface OrtSession {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>>;
}
export interface OrtModule {
  InferenceSession: { create(path: string, opts?: unknown): Promise<OrtSession> };
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
}
