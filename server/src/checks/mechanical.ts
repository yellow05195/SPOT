import { createHash } from "node:crypto";
import sharp from "sharp";
import type { SensorSample, RejectMotif } from "../domain/types.js";

/** Couche 2 — contrôles mécaniques (spec 4.2). Quelques millisecondes, de la moins chère à la plus chère. */

export const CLOCK_SKEW_MAX_MS = 20_000;
export const MIN_SENSOR_SAMPLES = 20; // 1,5 s à 30 Hz ≈ 45 ; on tolère les pertes d'échantillons

export interface MechanicalResult {
  reject: RejectMotif | null;
  flags: string[];
  width: number;
  height: number;
}

/**
 * Un flux caméra ne produit pas d'EXIF, de XMP ni d'IPTC ; leur présence prouve un import de fichier.
 * Le profil ICC n'en fait pas partie : Chrome (et d'autres) l'ajoutent à toute image exportée depuis un canvas.
 */
export async function hasEmbeddedMetadata(image: Buffer): Promise<boolean> {
  const meta = await sharp(image).metadata();
  return Boolean(meta.exif || meta.xmp || meta.iptc);
}

export function identicalBytes(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return createHash("sha256").update(a).digest().equals(createHash("sha256").update(b).digest());
}

export function clockSkewOk(clientMs: number, serverMs: number): boolean {
  return Math.abs(clientMs - serverMs) <= CLOCK_SKEW_MAX_MS;
}

/** Résolutions courantes de flux caméra mobile (les deux orientations). */
const STANDARD_DIMS = new Set(
  [
    [640, 480],
    [1280, 720],
    [1920, 1080],
    [1440, 1080],
    [2560, 1440],
    [3840, 2160],
    [1600, 1200],
    [1024, 768],
    [960, 720],
    [1280, 960],
  ].flatMap(([w, h]) => [`${w}x${h}`, `${h}x${w}`]),
);

export function isStandardResolution(width: number, height: number): boolean {
  return STANDARD_DIMS.has(`${width}x${height}`);
}

export interface SensorVerdict {
  reject: RejectMotif | null;
  variance: number;
  regularity: number;
}

/**
 * Une main humaine n'est jamais parfaitement immobile (variance nulle → rejet), et n'est jamais
 * parfaitement périodique non plus : une sinusoïde synthétique a des secondes différences
 * minuscules par rapport à son amplitude. On mesure le rapport énergie(2e différence) / variance.
 */
export function analyzeSensors(samples: SensorSample[]): SensorVerdict {
  if (samples.length < MIN_SENSOR_SAMPLES) {
    return { reject: "capteurs immobiles", variance: 0, regularity: 0 };
  }
  const axes: (keyof SensorSample)[] = ["ax", "ay", "az", "gx", "gy", "gz"];
  let totalVariance = 0;
  let regularitySum = 0;
  let regularityCount = 0;
  for (const axis of axes) {
    const xs = samples.map((s) => s[axis]);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
    totalVariance += variance;
    if (variance < 1e-9) continue;
    let d2 = 0;
    for (let i = 2; i < xs.length; i++) {
      const second = (xs[i] as number) - 2 * (xs[i - 1] as number) + (xs[i - 2] as number);
      d2 += second * second;
    }
    d2 /= xs.length - 2;
    // Bruit blanc : d2/variance ≈ 6. Sinusoïde lente échantillonnée finement : ≈ (ω²)² → très petit.
    regularitySum += d2 / variance;
    regularityCount += 1;
  }
  if (totalVariance < 1e-7) return { reject: "capteurs immobiles", variance: totalVariance, regularity: 0 };
  const regularity = regularityCount === 0 ? 0 : regularitySum / regularityCount;
  if (regularity < 0.05) return { reject: "capteurs trop réguliers", variance: totalVariance, regularity };
  return { reject: null, variance: totalVariance, regularity };
}

export async function mechanicalChecks(input: {
  frameA: Buffer;
  frameB: Buffer;
  sensors: SensorSample[];
  clientTimestampMs: number;
  nowMs: number;
}): Promise<MechanicalResult> {
  const flags: string[] = [];
  const metaA = await sharp(input.frameA).metadata();
  const width = metaA.width ?? 0;
  const height = metaA.height ?? 0;

  if (await hasEmbeddedMetadata(input.frameA)) return { reject: "métadonnées de fichier détectées", flags, width, height };
  if (await hasEmbeddedMetadata(input.frameB)) return { reject: "métadonnées de fichier détectées", flags, width, height };

  const sensors = analyzeSensors(input.sensors);
  if (sensors.reject) return { reject: sensors.reject, flags, width, height };

  if (identicalBytes(input.frameA, input.frameB)) return { reject: "images identiques", flags, width, height };
  if (!clockSkewOk(input.clientTimestampMs, input.nowMs)) return { reject: "horloge incohérente", flags, width, height };

  if (!isStandardResolution(width, height)) flags.push("résolution non standard");
  return { reject: null, flags, width, height };
}
