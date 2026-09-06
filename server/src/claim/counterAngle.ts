import { toGray } from "../vision/gray.js";
import { blockFlow, flowVariance, PARALLAX_WIDTH } from "../vision/parallax.js";
import { hamming, DUPLICATE_DISTANCE } from "../vision/phash.js";
import { cosine, SAME_OBJECT_THRESHOLD } from "../vision/clip.js";

/**
 * Couche 6 — le contre-angle (spec 4.6). Le second cliché doit :
 *  - montrer le même objet (CLIP : similarité entre les deux clichés ≥ 0,6, et avec la marque)
 *  - avoir un point de vue SIGNIFICATIVEMENT différent
 *  - arriver dans le délai (60 s)
 *
 * Estimation du changement de point de vue : à défaut d'une homographie complète, on mesure le
 * déplacement global médian et la non-uniformité du champ de flot entre les deux clichés. Une
 * transformation trop proche de l'identité (peu de déplacement, champ uniforme) est un rejet ;
 * un pas de côté produit à la fois un grand déplacement et un champ non uniforme (parallaxe).
 */

export const COUNTER_ANGLE_WINDOW_MS = 60_000;
export const MIN_MEDIAN_SHIFT_PX = 4; // sur une image de 192 px de large
export const MIN_FLOW_VARIANCE = 1.0;

export interface ViewpointResult {
  differentEnough: boolean;
  medianShift: number;
  variance: number;
  texturedBlocks: number;
}

export async function viewpointChange(first: Buffer, second: Buffer): Promise<ViewpointResult> {
  const a = await toGray(first, PARALLAX_WIDTH);
  const b = await toGray(second, PARALLAX_WIDTH);
  const vectors = blockFlow(a, b);
  const { variance } = flowVariance(vectors);
  const shifts = vectors.map((v) => Math.hypot(v.dx, v.dy)).sort((x, y) => x - y);
  const medianShift = shifts.length ? (shifts[Math.floor(shifts.length / 2)] as number) : 0;
  // Peu de blocs appariés (l'objet a beaucoup bougé, le bloc sort de la fenêtre de recherche) est
  // aussi un signe de changement réel : on ne rejette que si le champ est trouvé ET quasi identique.
  const differentEnough = vectors.length < 8 || medianShift >= MIN_MEDIAN_SHIFT_PX || variance >= MIN_FLOW_VARIANCE;
  return { differentEnough, medianShift, variance, texturedBlocks: vectors.length };
}

export interface CounterAngleVerdict {
  ok: boolean;
  reason: "contre-angle trop proche" | "objet non reconnu" | "déjà consignée" | null;
}

export function judgeCounterAngle(input: {
  sameImage: { firstPhash: Buffer; secondPhash: Buffer };
  embeddings: { first: ArrayLike<number>; second: ArrayLike<number> };
  brandScoreSecond: number;
  rejectThreshold: number;
  viewpoint: ViewpointResult;
}): CounterAngleVerdict {
  if (hamming(input.sameImage.firstPhash, input.sameImage.secondPhash) < DUPLICATE_DISTANCE / 2) {
    return { ok: false, reason: "contre-angle trop proche" };
  }
  if (input.brandScoreSecond < input.rejectThreshold) return { ok: false, reason: "objet non reconnu" };
  if (cosine(input.embeddings.first, input.embeddings.second) < SAME_OBJECT_THRESHOLD) return { ok: false, reason: "objet non reconnu" };
  if (!input.viewpoint.differentEnough) return { ok: false, reason: "contre-angle trop proche" };
  return { ok: true, reason: null };
}
