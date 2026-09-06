import { Manuscrit } from "./Manuscrit";
import { Tampon } from "./Tampon";
import { BrandLogo } from "./BrandLogo";
import { coeff, dateRoman, heure, numero, tokens } from "@/lib/format";

/**
 * The sighting card: the central object. Frosted glass, the photo edge to edge, the brand's real
 * logo floating over it, the name in bold, the data line in mono, the number and a status badge.
 * Rarity shows as a golden ring above ×4.
 */
export interface FicheProps {
  id: number;
  brand: string;
  image: string | null;
  date: Date;
  city: string;
  rarity: number;
  fragment?: { amount: bigint | string; symbol: string } | null;
  stamp?: { text: string; tone: "red" | "green"; drop?: boolean } | null;
  size?: "sm" | "md" | "lg";
  empty?: boolean;
  animate?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function rarityTreatment(r: number): { gilt: boolean; tier: "common" | "uncommon" | "rare" | "legendary" } {
  if (r > 4) return { gilt: true, tier: "legendary" };
  if (r >= 2.5) return { gilt: false, tier: "rare" };
  if (r >= 1) return { gilt: false, tier: "uncommon" };
  return { gilt: false, tier: "common" };
}

export function Fiche(p: FicheProps) {
  const t = rarityTreatment(p.rarity);
  const sizeClass = p.size === "sm" ? "fiche-sm" : p.size === "lg" ? "fiche-lg" : "";
  const logoSize = p.size === "sm" ? 34 : p.size === "lg" ? 48 : 40;
  return (
    <figure className={`fiche ${sizeClass} ${t.gilt ? "fiche-gilt" : ""} ${p.animate ? "fiche-animate" : ""} ${p.className ?? ""}`} style={p.style} aria-label={`Card ${numero(p.id)}, ${p.brand}, ${dateRoman(p.date)}, ${p.city}, coefficient ${coeff(p.rarity)}`}>
      <div className="fiche-photo">
        {p.empty || !p.image ? <div className="fiche-photo-empty" aria-hidden="true" /> : <img src={p.image} alt="" className="fiche-img" loading="lazy" />}
      </div>
      <figcaption className="fiche-caption">
        <div className="fiche-name">
          <BrandLogo brand={p.brand} size={logoSize} />
          <Manuscrit text={p.brand} strong={t.gilt} animate={p.animate} />
        </div>
        <p className="mono fiche-line">
          {dateRoman(p.date)} · {heure(p.date)} · {p.city}
        </p>
        <p className="mono fiche-line" style={{ color: "var(--text)" }}>
          {coeff(p.rarity)}
          {p.fragment ? ` · ${tokens(p.fragment.amount, p.fragment.symbol)}` : ""}
        </p>
        <div className="fiche-foot">
          <span className="mono legend">{numero(p.id)}</span>
          {p.stamp && <Tampon text={p.stamp.text} tone={p.stamp.tone} drop={p.stamp.drop} />}
        </div>
      </figcaption>
    </figure>
  );
}
