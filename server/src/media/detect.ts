import sharp from "sharp";
import type { OrtModule } from "../vision/clip.js";

/** Boîte en pixels de l'image d'origine. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
}

export interface Detector {
  detect(image: Buffer): Promise<Box[]>;
}

export class NullDetector implements Detector {
  async detect(): Promise<Box[]> {
    return [];
  }
}

export interface OnnxDetectorConfig {
  modelPath: string;
  inputWidth: number;
  inputHeight: number;
  /** "ultraface" : sorties scores[1,N,2] + boxes[1,N,4] normalisées ; "yolo" : sortie [1,4+nc,N]. */
  layout: "ultraface" | "yolo";
  threshold: number;
  /** normalisation : (x - mean) / scale */
  mean: number;
  scale: number;
}

/**
 * Détecteur ONNX générique (visages : UltraFace-320 ; plaques : un YOLO entraîné plaques).
 * Les poids ne sont pas dans le dépôt : `models/face.onnx`, `models/plate.onnx`.
 */
export class OnnxDetector implements Detector {
  private session: Promise<{ run: (f: Record<string, unknown>) => Promise<Record<string, { data: ArrayLike<number>; dims: readonly number[] }>>; inputNames: readonly string[]; outputNames: readonly string[] }> | null = null;
  constructor(private readonly cfg: OnnxDetectorConfig) {}

  private async load() {
    if (!this.session) {
      this.session = (async () => {
        const ort = (await import("onnxruntime-node")) as unknown as OrtModule;
        return ort.InferenceSession.create(this.cfg.modelPath, { executionProviders: ["cpu"] });
      })();
    }
    return this.session;
  }

  async detect(image: Buffer): Promise<Box[]> {
    const ort = (await import("onnxruntime-node")) as unknown as OrtModule;
    const session = await this.load();
    const meta = await sharp(image).metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    const { inputWidth: iw, inputHeight: ih } = this.cfg;
    const { data } = await sharp(image).resize(iw, ih, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const tensor = new Float32Array(3 * iw * ih);
    for (let i = 0; i < iw * ih; i++) {
      for (let c = 0; c < 3; c++) tensor[c * iw * ih + i] = ((data[i * 3 + c] as number) - this.cfg.mean) / this.cfg.scale;
    }
    const feeds = { [session.inputNames[0] ?? "input"]: new ort.Tensor("float32", tensor, [1, 3, ih, iw]) };
    const out = await session.run(feeds);
    const boxes = this.cfg.layout === "ultraface" ? parseUltraFace(out, session.outputNames) : parseYolo(out, session.outputNames, iw, ih);
    return nms(boxes.map((b) => ({ ...b, x: b.x * W, y: b.y * H, w: b.w * W, h: b.h * H })), 0.4).filter((b) => b.score >= this.cfg.threshold);
  }
}

/** UltraFace : scores [1,N,2], boxes [1,N,4] en (x1,y1,x2,y2) normalisés. */
export function parseUltraFace(out: Record<string, { data: ArrayLike<number>; dims: readonly number[] }>, names: readonly string[]): Box[] {
  const scores = out[names[0] ?? "scores"];
  const boxes = out[names[1] ?? "boxes"];
  if (!scores || !boxes) return [];
  const n = scores.dims[1] ?? 0;
  const res: Box[] = [];
  for (let i = 0; i < n; i++) {
    const s = scores.data[i * 2 + 1] as number;
    if (s < 0.3) continue;
    const x1 = boxes.data[i * 4] as number;
    const y1 = boxes.data[i * 4 + 1] as number;
    const x2 = boxes.data[i * 4 + 2] as number;
    const y2 = boxes.data[i * 4 + 3] as number;
    res.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, score: s });
  }
  return res;
}

/** YOLOv8 : sortie [1, 4+nc, N] avec (cx, cy, w, h) en pixels d'entrée. */
export function parseYolo(out: Record<string, { data: ArrayLike<number>; dims: readonly number[] }>, names: readonly string[], iw: number, ih: number): Box[] {
  const t = out[names[0] ?? "output0"];
  if (!t) return [];
  const rows = t.dims[1] ?? 0;
  const n = t.dims[2] ?? 0;
  const res: Box[] = [];
  for (let i = 0; i < n; i++) {
    let best = 0;
    for (let c = 4; c < rows; c++) best = Math.max(best, t.data[c * n + i] as number);
    if (best < 0.3) continue;
    const cx = t.data[i] as number;
    const cy = t.data[n + i] as number;
    const w = t.data[2 * n + i] as number;
    const h = t.data[3 * n + i] as number;
    res.push({ x: (cx - w / 2) / iw, y: (cy - h / 2) / ih, w: w / iw, h: h / ih, score: best });
  }
  return res;
}

export function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union <= 0 ? 0 : inter / union;
}

export function nms(boxes: Box[], threshold: number): Box[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const kept: Box[] = [];
  for (const b of sorted) {
    if (kept.every((k) => iou(k, b) < threshold)) kept.push(b);
  }
  return kept;
}
