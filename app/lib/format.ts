/** Notebook formats: roman-numeral months, ×2.40 coefficients, six-decimal token amounts. */

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export function dateRoman(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}.${ROMAN[d.getMonth()]}.${String(d.getFullYear()).slice(-2)}`;
}

export function heure(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function dateLettres(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
}

export function coeff(x: number): string {
  return `×${x.toFixed(2)}`;
}

export function usd(x: number): string {
  return `$${x.toFixed(2)}`;
}

export function tokens(amountWei: bigint | string, symbol: string): string {
  const a = typeof amountWei === "string" ? BigInt(amountWei) : amountWei;
  const whole = a / 10n ** 18n;
  const frac = ((a % 10n ** 18n) / 10n ** 12n).toString().padStart(6, "0");
  return `${whole}.${frac} ${symbol}`;
}

export function numero(id: number): string {
  return `No. ${String(id).padStart(6, "0")}`;
}

export function duree(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}

/** Stable offset and rotation derived from an id (plates, the field wall). */
export function jitter(id: number | string, maxPx: number, maxDeg: number): { dx: number; dy: number; rot: number } {
  let h = 2166136261;
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const u = (n: number) => ((h >>> (n * 8)) & 0xff) / 255 - 0.5;
  return { dx: Math.round(u(0) * 2 * maxPx), dy: Math.round(u(1) * 2 * maxPx), rot: Number((u(2) * 2 * maxDeg).toFixed(2)) };
}

export function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
