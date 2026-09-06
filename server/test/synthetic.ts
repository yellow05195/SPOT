import sharp from "sharp";

/** Images synthétiques déterministes pour tester la vision sans fichiers. */

export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

/** Bruit lissé (texture naturelle) en niveaux de gris, w×h. */
export function texture(w: number, h: number, seed = 1, scale = 6): Uint8Array {
  const rnd = seeded(seed);
  const cw = Math.ceil(w / scale) + 2;
  const ch = Math.ceil(h / scale) + 2;
  const coarse = new Float32Array(cw * ch);
  for (let i = 0; i < coarse.length; i++) coarse[i] = rnd() * 255;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = x / scale;
      const gy = y / scale;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = gx - x0;
      const ty = gy - y0;
      const v =
        (coarse[y0 * cw + x0] as number) * (1 - tx) * (1 - ty) +
        (coarse[y0 * cw + x0 + 1] as number) * tx * (1 - ty) +
        (coarse[(y0 + 1) * cw + x0] as number) * (1 - tx) * ty +
        (coarse[(y0 + 1) * cw + x0 + 1] as number) * tx * ty;
      out[y * w + x] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return out;
}

/** Décale une image par régions : `shiftAt(x, y)` retourne le déplacement (dx, dy) de la source. */
export function warp(src: Uint8Array, w: number, h: number, shiftAt: (x: number, y: number) => [number, number]): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [dx, dy] = shiftAt(x, y);
      const sx = Math.max(0, Math.min(w - 1, x - dx));
      const sy = Math.max(0, Math.min(h - 1, y - dy));
      out[y * w + x] = src[sy * w + sx] as number;
    }
  }
  return out;
}

export function addNoise(src: Uint8Array, amplitude: number, seed = 7): Uint8Array {
  const rnd = seeded(seed);
  const out = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) {
    out[i] = Math.max(0, Math.min(255, Math.round((src[i] as number) + (rnd() - 0.5) * 2 * amplitude)));
  }
  return out;
}

/** Superpose une grille de pixels d'écran (période `period`). */
export function addScreenGrid(src: Uint8Array, w: number, h: number, period: number, amplitude: number): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const g = (Math.sin((2 * Math.PI * x) / period) + Math.sin((2 * Math.PI * y) / period)) * amplitude;
      out[y * w + x] = Math.max(0, Math.min(255, Math.round((src[y * w + x] as number) + g)));
    }
  }
  return out;
}

/** Dessine un cadre sombre (écran posé sur un fond clair). */
export function addFrame(src: Uint8Array, w: number, h: number, inset: number, value: number): Uint8Array {
  const out = new Uint8Array(src);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const onFrame = x < inset || x >= w - inset || y < inset || y >= h - inset;
      if (onFrame) out[y * w + x] = value;
    }
  }
  return out;
}

export async function toPng(gray: Uint8Array, w: number, h: number): Promise<Buffer> {
  return sharp(Buffer.from(gray), { raw: { width: w, height: h, channels: 1 } }).png().toBuffer();
}

export async function toJpeg(gray: Uint8Array, w: number, h: number, quality = 90): Promise<Buffer> {
  return sharp(Buffer.from(gray), { raw: { width: w, height: h, channels: 1 } }).jpeg({ quality }).toBuffer();
}

export function flat(w: number, h: number, value: number): Uint8Array {
  return new Uint8Array(w * h).fill(value);
}
