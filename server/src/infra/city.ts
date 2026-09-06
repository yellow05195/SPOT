/**
 * Localisation grossière uniquement (spec 1.5) : une ville, jamais des coordonnées.
 * `cityCode` est un hachage stable (FNV-1a 32 bits) de "Ville, CC" — c'est ce qui va on-chain.
 */
export function cityCode(label: string): number {
  let h = 0x811c9dc5;
  for (const ch of label.normalize("NFKD").toLowerCase()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function cityLabel(city: string | null | undefined, country: string | null | undefined): string {
  const c = (city ?? "").trim();
  const cc = (country ?? "").trim().toUpperCase();
  if (!c && !cc) return "lieu inconnu";
  if (!c) return cc;
  return cc ? `${c}, ${cc}` : c;
}
