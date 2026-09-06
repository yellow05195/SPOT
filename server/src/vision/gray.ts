import sharp from "sharp";

export interface GrayImage {
  data: Uint8Array;
  width: number;
  height: number;
}

/** Image en niveaux de gris, redimensionnée à `width` de large (ratio conservé). Toujours en mémoire. */
export async function toGray(image: Buffer, width: number): Promise<GrayImage> {
  const { data, info } = await sharp(image)
    .resize({ width, withoutEnlargement: false })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

/** Gris exact `width`×`height` (déformation acceptée) — pour le pHash. */
export async function toGrayExact(image: Buffer, width: number, height: number): Promise<GrayImage> {
  const { data, info } = await sharp(image)
    .resize(width, height, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

export function crop(img: GrayImage, x: number, y: number, w: number, h: number): GrayImage {
  const out = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    out.set(img.data.subarray((y + j) * img.width + x, (y + j) * img.width + x + w), j * w);
  }
  return { data: out, width: w, height: h };
}

export function topHalf(img: GrayImage): GrayImage {
  return crop(img, 0, 0, img.width, Math.floor(img.height / 2));
}

export function mean(xs: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i] as number;
  return xs.length ? s / xs.length : 0;
}

export function variance(xs: ArrayLike<number>): number {
  const m = mean(xs);
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += ((xs[i] as number) - m) ** 2;
  return xs.length ? s / xs.length : 0;
}
