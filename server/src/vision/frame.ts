import { toGray, type GrayImage, variance } from "./gray.js";

/**
 * Couche 3 — bordure rectangulaire et uniformité de luminance (spec 4.3).
 * - Un rectangle net à luminance différente encadrant la scène trahit un écran ou une impression :
 *   on cherche deux arêtes verticales longues (gauche/droite) ET deux horizontales (haut/bas).
 * - Un écran émet une lumière trop homogène : écart-type de luminance anormalement bas.
 */

export const FRAME_WIDTH = 256;
export const EDGE_STRENGTH = 40; // différence de gris de part et d'autre de l'arête
export const EDGE_COVERAGE = 0.6; // fraction de la longueur qui doit être une arête
export const LUMINANCE_STD_MIN = 14;

export interface BorderResult {
  detected: boolean;
  verticalEdges: number[];
  horizontalEdges: number[];
}

function longEdges(img: GrayImage, vertical: boolean): number[] {
  const found: number[] = [];
  const outer = vertical ? img.width : img.height;
  const inner = vertical ? img.height : img.width;
  // Une arête de cadre est cohérente en signe sur toute sa longueur (sombre → clair d'un seul côté).
  // Une texture produit des différences fortes mais de signes mêlés.
  for (let p = 2; p < outer - 2; p++) {
    let positive = 0;
    let negative = 0;
    for (let q = 0; q < inner; q++) {
      const before = vertical ? img.data[q * img.width + p - 2] : img.data[(p - 2) * img.width + q];
      const after = vertical ? img.data[q * img.width + p + 2] : img.data[(p + 2) * img.width + q];
      const d = (after as number) - (before as number);
      if (d >= EDGE_STRENGTH) positive += 1;
      else if (d <= -EDGE_STRENGTH) negative += 1;
    }
    if (Math.max(positive, negative) / inner >= EDGE_COVERAGE) found.push(p);
  }
  return found;
}

export function borderOnGray(img: GrayImage): BorderResult {
  const v = longEdges(img, true);
  const h = longEdges(img, false);
  const left = v.some((x) => x < img.width / 3);
  const right = v.some((x) => x > (2 * img.width) / 3);
  const top = h.some((y) => y < img.height / 3);
  const bottom = h.some((y) => y > (2 * img.height) / 3);
  // Un cadre complet ou trois côtés nets (le quatrième peut être hors champ).
  const sides = [left, right, top, bottom].filter(Boolean).length;
  return { detected: sides >= 3, verticalEdges: v, horizontalEdges: h };
}

export async function borderCheck(frame: Buffer): Promise<BorderResult> {
  return borderOnGray(await toGray(frame, FRAME_WIDTH));
}

export interface LuminanceResult {
  suspicious: boolean;
  std: number;
}

export function luminanceOnGray(img: GrayImage): LuminanceResult {
  const std = Math.sqrt(variance(img.data));
  return { suspicious: std < LUMINANCE_STD_MIN, std };
}

export async function luminanceCheck(frame: Buffer): Promise<LuminanceResult> {
  return luminanceOnGray(await toGray(frame, FRAME_WIDTH));
}
