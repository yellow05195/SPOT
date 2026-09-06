import { toGray, type GrayImage, variance } from "./gray.js";

/**
 * Couche 3 — parallaxe (spec 4.3).
 * Flot optique dense par appariement de blocs entre les deux frames. Un objet réel produit un champ
 * NON uniforme (le proche bouge plus que le fond) ; une photo d'écran ou d'impression produit un champ
 * uniforme : tout se déplace en bloc. variance(champ) < seuil → scène plane.
 */

export const PARALLAX_WIDTH = 192;
export const BLOCK = 16;
export const SEARCH = 7;
export const TEXTURE_MIN_VARIANCE = 40; // blocs trop lisses : pas d'appariement fiable
export const PLANAR_VARIANCE_MAX = 0.6; // px²
export const MIN_TEXTURED_BLOCKS = 12;

export interface FlowVector {
  bx: number;
  by: number;
  dx: number;
  dy: number;
}

export interface ParallaxResult {
  planar: boolean;
  variance: number;
  meanDx: number;
  meanDy: number;
  vectors: FlowVector[];
  texturedBlocks: number;
}

function sad(a: GrayImage, b: GrayImage, ax: number, ay: number, bx: number, by: number): number {
  let s = 0;
  for (let j = 0; j < BLOCK; j++) {
    const ra = (ay + j) * a.width + ax;
    const rb = (by + j) * b.width + bx;
    for (let i = 0; i < BLOCK; i++) s += Math.abs((a.data[ra + i] as number) - (b.data[rb + i] as number));
  }
  return s;
}

export function blockFlow(a: GrayImage, b: GrayImage): FlowVector[] {
  const vectors: FlowVector[] = [];
  const cols = Math.floor(a.width / BLOCK);
  const rows = Math.floor(a.height / BLOCK);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * BLOCK;
      const y = r * BLOCK;
      const px: number[] = [];
      for (let j = 0; j < BLOCK; j++) for (let i = 0; i < BLOCK; i++) px.push(a.data[(y + j) * a.width + x + i] as number);
      if (variance(px) < TEXTURE_MIN_VARIANCE) continue;
      let best = Infinity;
      let bdx = 0;
      let bdy = 0;
      for (let dy = -SEARCH; dy <= SEARCH; dy++) {
        const ty = y + dy;
        if (ty < 0 || ty + BLOCK > b.height) continue;
        for (let dx = -SEARCH; dx <= SEARCH; dx++) {
          const tx = x + dx;
          if (tx < 0 || tx + BLOCK > b.width) continue;
          const s = sad(a, b, x, y, tx, ty);
          if (s < best) {
            best = s;
            bdx = dx;
            bdy = dy;
          }
        }
      }
      vectors.push({ bx: c, by: r, dx: bdx, dy: bdy });
    }
  }
  return vectors;
}

export function flowVariance(vectors: FlowVector[]): { variance: number; meanDx: number; meanDy: number } {
  if (vectors.length === 0) return { variance: 0, meanDx: 0, meanDy: 0 };
  const meanDx = vectors.reduce((s, v) => s + v.dx, 0) / vectors.length;
  const meanDy = vectors.reduce((s, v) => s + v.dy, 0) / vectors.length;
  const v = vectors.reduce((s, x) => s + (x.dx - meanDx) ** 2 + (x.dy - meanDy) ** 2, 0) / vectors.length;
  return { variance: v, meanDx, meanDy };
}

export async function parallaxCheck(frameA: Buffer, frameB: Buffer): Promise<ParallaxResult> {
  const a = await toGray(frameA, PARALLAX_WIDTH);
  const b = await toGray(frameB, PARALLAX_WIDTH);
  const vectors = blockFlow(a, b);
  const { variance: v, meanDx, meanDy } = flowVariance(vectors);
  // Trop peu de texture pour juger : on ne condamne pas, les autres couches tranchent.
  const planar = vectors.length >= MIN_TEXTURED_BLOCKS && v < PLANAR_VARIANCE_MAX;
  return { planar, variance: v, meanDx, meanDy, vectors, texturedBlocks: vectors.length };
}
