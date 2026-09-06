import { createHash } from "node:crypto";
import sharp, { type OverlayOptions } from "sharp";
import type { Hex } from "viem";
import type { Detector, Box } from "./detect.js";

/**
 * Traitement d'image (spec 7.3), ordre strict, EN MÉMOIRE, jamais sur disque :
 *   buffer reçu → suppression EXIF → floutage visages → floutage plaques → 1600 px max
 *   → WebP q82 → sha256 → écriture objet (par l'appelant).
 * Le fichier original n'est jamais écrit. Si le processus plante en cours de route, il ne reste rien.
 */

export const MAX_DIMENSION = 1600;
export const WEBP_QUALITY = 82;
export const BLUR_SIGMA = 18;
export const BLUR_MARGIN = 0.15; // on floute un peu plus large que la boîte

export interface ProcessedImage {
  webp: Buffer;
  sha256: Hex;
  width: number;
  height: number;
  blurredRegions: number;
}

export async function blurRegions(image: Buffer, boxes: Box[]): Promise<Buffer> {
  if (boxes.length === 0) return image;
  const meta = await sharp(image).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const composites: OverlayOptions[] = [];
  for (const b of boxes) {
    const mx = b.w * BLUR_MARGIN;
    const my = b.h * BLUR_MARGIN;
    const left = Math.max(0, Math.floor(b.x - mx));
    const top = Math.max(0, Math.floor(b.y - my));
    const width = Math.min(W - left, Math.ceil(b.w + 2 * mx));
    const height = Math.min(H - top, Math.ceil(b.h + 2 * my));
    if (width <= 0 || height <= 0) continue;
    const region = await sharp(image).extract({ left, top, width, height }).blur(BLUR_SIGMA).toBuffer();
    composites.push({ input: region, left, top });
  }
  if (composites.length === 0) return image;
  return sharp(image).composite(composites).toBuffer();
}

export async function processImage(original: Buffer, faces: Detector, plates: Detector): Promise<ProcessedImage> {
  // 1. suppression des métadonnées : on ré-encode sans withMetadata() → EXIF, XMP, IPTC, ICC disparaissent
  let working: Buffer = await sharp(original).rotate().toFormat("png").toBuffer();

  // 2. visages, 3. plaques
  const faceBoxes = await faces.detect(working);
  working = await blurRegions(working, faceBoxes);
  const plateBoxes = await plates.detect(working);
  working = await blurRegions(working, plateBoxes);

  // 4. 1600 px max, 5. WebP 82
  const { data, info } = await sharp(working)
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });

  // 6. sha256
  const sha256 = `0x${createHash("sha256").update(data).digest("hex")}` as Hex;
  return { webp: data, sha256, width: info.width, height: info.height, blurredRegions: faceBoxes.length + plateBoxes.length };
}
