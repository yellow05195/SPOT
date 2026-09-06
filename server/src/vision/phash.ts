import { toGrayExact, topHalf, type GrayImage } from "./gray.js";

/**
 * Couche 5 — pHash perceptuel (spec 4.5). DCT 32×32, bloc 8×8 basse fréquence sans le DC,
 * seuil à la médiane → 64 bits. Distance de Hamming < 8 == même photo.
 */

export const PHASH_SIZE = 32;
export const PHASH_LOW = 8;
export const DUPLICATE_DISTANCE = 8;

const cosTable: number[][] = [];
for (let u = 0; u < PHASH_SIZE; u++) {
  cosTable[u] = [];
  for (let x = 0; x < PHASH_SIZE; x++) {
    (cosTable[u] as number[])[x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * PHASH_SIZE));
  }
}

/** DCT-II séparable, on ne calcule que le coin PHASH_LOW×PHASH_LOW. */
export function dctLow(img: GrayImage): number[][] {
  const n = PHASH_SIZE;
  const rows: number[][] = [];
  for (let y = 0; y < n; y++) {
    const r: number[] = [];
    for (let u = 0; u < PHASH_LOW; u++) {
      let s = 0;
      const ct = cosTable[u] as number[];
      for (let x = 0; x < n; x++) s += (img.data[y * n + x] as number) * (ct[x] as number);
      r.push(s);
    }
    rows.push(r);
  }
  const out: number[][] = [];
  for (let v = 0; v < PHASH_LOW; v++) {
    const ct = cosTable[v] as number[];
    const line: number[] = [];
    for (let u = 0; u < PHASH_LOW; u++) {
      let s = 0;
      for (let y = 0; y < n; y++) s += ((rows[y] as number[])[u] as number) * (ct[y] as number);
      line.push(s);
    }
    out.push(line);
  }
  return out;
}

export function phashOfGray(img: GrayImage): Buffer {
  if (img.width !== PHASH_SIZE || img.height !== PHASH_SIZE) throw new Error("pHash attend 32×32");
  const dct = dctLow(img);
  const coeffs: number[] = [];
  for (let v = 0; v < PHASH_LOW; v++) for (let u = 0; u < PHASH_LOW; u++) if (u !== 0 || v !== 0) coeffs.push((dct[v] as number[])[u] as number);
  const sorted = [...coeffs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] as number;
  const bits = Buffer.alloc(8);
  let i = 0;
  for (let v = 0; v < PHASH_LOW; v++) {
    for (let u = 0; u < PHASH_LOW; u++) {
      const c = u === 0 && v === 0 ? median : ((dct[v] as number[])[u] as number);
      if (c > median) bits[i >> 3] = (bits[i >> 3] as number) | (1 << (7 - (i & 7)));
      i += 1;
    }
  }
  return bits;
}

export async function phash(image: Buffer): Promise<Buffer> {
  return phashOfGray(await toGrayExact(image, PHASH_SIZE, PHASH_SIZE));
}

/** pHash de la moitié supérieure : l'arrière-plan récurrent (spec 4.5, « depuis sa fenêtre »). */
export async function backgroundPhash(image: Buffer): Promise<Buffer> {
  const gray = await toGrayExact(image, PHASH_SIZE, PHASH_SIZE * 2);
  return phashOfGray(topHalf(gray));
}

export function hamming(a: Buffer, b: Buffer): number {
  let d = 0;
  for (let i = 0; i < 8; i++) {
    let x = ((a[i] as number) ^ (b[i] as number)) & 0xff;
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}
