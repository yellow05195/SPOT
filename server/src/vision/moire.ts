import { toGray, crop, type GrayImage } from "./gray.js";
import { magnitudeSpectrum } from "./fft.js";

/**
 * Couche 3 — moiré (spec 4.3).
 * FFT 2D sur des tuiles de l'image, recherche de pics isolés à la fréquence de la grille de pixels
 * d'un écran. Une scène naturelle a un spectre qui décroît régulièrement ; une photo d'écran non
 * recadrée présente des pics étroits très au-dessus de leur voisinage.
 */

export const MOIRE_WIDTH = 512;
export const TILE = 64;
export const BAND_MIN = 6; // rayon spectral minimal (on ignore les basses fréquences)
export const PEAK_RATIO = 8; // pic / moyenne de son propre anneau de fréquence
export const TILE_FRACTION = 0.2; // part de tuiles partageant le même pic pour conclure
export const PEAK_BUCKET = 2; // tolérance (en cases de fréquence) pour regrouper les pics de tuiles différentes

export interface MoireResult {
  detected: boolean;
  /** taille de la plus grande famille de tuiles au pic commun */
  flaggedTiles: number;
  totalTiles: number;
  maxRatio: number;
}

/**
 * Le pic le plus dominant du spectre d'une tuile, hors basses fréquences : son rapport à la moyenne
 * de son anneau de fréquence et sa position (fx, fy). Une grille d'écran crée un pic étroit qui
 * domine son anneau.
 */
export function tilePeak(tile: GrayImage): { ratio: number; fx: number; fy: number } {
  const n = tile.width;
  const mag = magnitudeSpectrum(tile.data, n);
  const half = n / 2;
  const ringMax = new Float64Array(half + 1);
  const ringSum = new Float64Array(half + 1);
  const ringCount = new Uint32Array(half + 1);
  const ringAtX = new Int16Array(half + 1);
  const ringAtY = new Int16Array(half + 1);
  for (let y = 0; y < n; y++) {
    const fy = y < half ? y : y - n;
    for (let x = 0; x < n; x++) {
      const fx = x < half ? x : x - n;
      const r = Math.round(Math.hypot(fx, fy));
      if (r < BAND_MIN || r >= half) continue;
      const m = mag[y * n + x] as number;
      ringSum[r] = (ringSum[r] as number) + m;
      ringCount[r] = (ringCount[r] as number) + 1;
      if (m > (ringMax[r] as number)) {
        ringMax[r] = m;
        ringAtX[r] = fx;
        ringAtY[r] = fy;
      }
    }
  }
  let best = { ratio: 0, fx: 0, fy: 0 };
  for (let r = BAND_MIN; r < half; r++) {
    const count = ringCount[r] as number;
    if (count < 8) continue;
    const mean = (ringSum[r] as number) / count;
    if (mean <= 1e-9) continue;
    const ratio = (ringMax[r] as number) / mean;
    if (ratio > best.ratio) best = { ratio, fx: ringAtX[r] as number, fy: ringAtY[r] as number };
  }
  return best;
}

/** Compatibilité : le seul rapport. */
export function tilePeakRatio(tile: GrayImage): number {
  return tilePeak(tile).ratio;
}

/**
 * Le spectre est symétrique (un pic en (fx, fy) a son jumeau en (-fx, -fy)) : on ramène chaque pic
 * dans le demi-plan fy > 0 (ou fy = 0, fx >= 0) puis on l'arrondit à ${PEAK_BUCKET} cases près, ce qui
 * tolère la légère perspective d'un écran photographié de biais.
 */
function peakKey(fx: number, fy: number): string {
  if (fy < 0 || (fy === 0 && fx < 0)) {
    fx = -fx;
    fy = -fy;
  }
  return Math.round(fx / PEAK_BUCKET) + "," + Math.round(fy / PEAK_BUCKET);
}

/**
 * Une rue réelle regorge de bords droits (façades, marquages, poteaux) : chaque tuile peut avoir
 * un pic étroit, mais à une fréquence qui lui est propre. Une grille de pixels, elle, a le même pas
 * partout dans l'image : ses pics tombent au même endroit du spectre dans toutes les tuiles. On ne
 * compte donc que la plus grande famille de tuiles partageant la même position de pic.
 */
export function moireOnGray(img: GrayImage): MoireResult {
  const cols = Math.floor(img.width / TILE);
  const rows = Math.floor(img.height / TILE);
  const clusters = new Map<string, number>();
  let total = 0;
  let maxRatio = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const peak = tilePeak(crop(img, c * TILE, r * TILE, TILE, TILE));
      total += 1;
      if (peak.ratio > maxRatio) maxRatio = peak.ratio;
      if (peak.ratio > PEAK_RATIO) {
        const k = peakKey(peak.fx, peak.fy);
        clusters.set(k, (clusters.get(k) ?? 0) + 1);
      }
    }
  }
  let flagged = 0;
  for (const n of clusters.values()) if (n > flagged) flagged = n;
  return { detected: total > 0 && flagged / total >= TILE_FRACTION, flaggedTiles: flagged, totalTiles: total, maxRatio };
}

export async function moireCheck(frame: Buffer): Promise<MoireResult> {
  return moireOnGray(await toGray(frame, MOIRE_WIDTH));
}
