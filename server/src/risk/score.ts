/**
 * Score de risque 0–100 (spec 4.7), recalculé à chaque prise.
 * Au-delà de 60 : contre-angle systématique, coefficient divisé par deux.
 * Au-delà de 85 : les prises produisent des fiches, jamais de fragments. Le compte n'est pas banni
 * et n'est pas prévenu — il joue dans le vide.
 */

export const RISK_COUNTER_ANGLE_ALWAYS = 60;
export const RISK_NO_FRAGMENTS = 85;
export const RISK_DECAY_PER_DAY = 5;

export const WEIGHTS = {
  walletYoungerThan24h: 15,
  tooManyWalletsOnDevice: 25, // > 2 wallets sur le même appareil en 24 h
  tooManyWalletsOnIp: 20, // > 6 wallets sur la même IP en 24 h
  twoCountriesWithinAnHour: 40,
  tooRegularIntervals: 20,
  counterAngleFailed: 30,
  layer3Reject: 25,
  sameMinuteOfDay: 10,
} as const;

export interface RiskSignals {
  walletAgeMs: number;
  walletsOnDevice24h: number;
  walletsOnIp24h: number;
  previousCountry: string | null;
  previousSeenAt: Date | null;
  currentCountry: string | null;
  /** intervalles (ms) entre les dernières prises, du plus ancien au plus récent */
  recentIntervalsMs: number[];
  counterAngleFailed: boolean;
  layer3Rejected: boolean;
  /** minute de la journée (0..1439) des dernières prises */
  recentMinutesOfDay: number[];
  currentMinuteOfDay: number;
}

export function intervalRegularity(intervalsMs: number[]): number {
  if (intervalsMs.length < 3) return Infinity;
  const mean = intervalsMs.reduce((a, b) => a + b, 0) / intervalsMs.length;
  const std = Math.sqrt(intervalsMs.reduce((a, b) => a + (b - mean) ** 2, 0) / intervalsMs.length);
  return mean === 0 ? 0 : std / mean; // coefficient de variation
}

export function riskDelta(s: RiskSignals, now: Date): { delta: number; reasons: string[] } {
  let delta = 0;
  const reasons: string[] = [];
  if (s.walletAgeMs < 24 * 3600 * 1000) {
    delta += WEIGHTS.walletYoungerThan24h;
    reasons.push("wallet de moins de 24 h");
  }
  if (s.walletsOnDevice24h > 2) {
    delta += WEIGHTS.tooManyWalletsOnDevice;
    reasons.push("plus de 2 wallets sur l'appareil");
  }
  if (s.walletsOnIp24h > 6) {
    delta += WEIGHTS.tooManyWalletsOnIp;
    reasons.push("plus de 6 wallets sur l'IP");
  }
  if (
    s.previousCountry &&
    s.currentCountry &&
    s.previousCountry !== s.currentCountry &&
    s.previousSeenAt &&
    now.getTime() - s.previousSeenAt.getTime() < 3600 * 1000
  ) {
    delta += WEIGHTS.twoCountriesWithinAnHour;
    reasons.push("deux pays en moins d'une heure");
  }
  if (intervalRegularity(s.recentIntervalsMs) < 0.08) {
    delta += WEIGHTS.tooRegularIntervals;
    reasons.push("intervalles trop réguliers");
  }
  if (s.counterAngleFailed) {
    delta += WEIGHTS.counterAngleFailed;
    reasons.push("contre-angle échoué");
  }
  if (s.layer3Rejected) {
    delta += WEIGHTS.layer3Reject;
    reasons.push("rejet en couche 3");
  }
  if (s.recentMinutesOfDay.length >= 3 && s.recentMinutesOfDay.every((m) => m === s.currentMinuteOfDay)) {
    delta += WEIGHTS.sameMinuteOfDay;
    reasons.push("toujours la même minute");
  }
  return { delta, reasons };
}

/** Décroissance −5/jour, appliquée depuis la dernière mise à jour. */
export function decayed(score: number, lastUpdated: Date | null, now: Date): number {
  if (!lastUpdated) return score;
  const days = Math.floor((now.getTime() - lastUpdated.getTime()) / (24 * 3600 * 1000));
  return Math.max(0, score - days * RISK_DECAY_PER_DAY);
}

export function nextRisk(current: number, lastUpdated: Date | null, signals: RiskSignals, now: Date): { risk: number; reasons: string[] } {
  const base = decayed(current, lastUpdated, now);
  const { delta, reasons } = riskDelta(signals, now);
  return { risk: Math.max(0, Math.min(100, base + delta)), reasons };
}

export function counterAngleRate(risk: number, base: number, high: number): number {
  return risk > RISK_COUNTER_ANGLE_ALWAYS ? 1 : Math.max(base, risk > 40 ? high : base);
}

export function rarityFactorForRisk(risk: number): number {
  return risk > RISK_COUNTER_ANGLE_ALWAYS ? 0.5 : 1;
}

export function fragmentsAllowed(risk: number): boolean {
  return risk <= RISK_NO_FRAGMENTS;
}
