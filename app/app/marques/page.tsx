import Link from "next/link";
import { api, SECTEURS } from "@/lib/api";
import { Manuscrit } from "@/components/Manuscrit";
import { BrandLogo } from "@/components/BrandLogo";
import { Reveal, Stagger, Item } from "@/components/Reveal";
import { coeff } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Brands" };

/** `/marques`: the principles, written like a field note, then the active brands and today's coefficient. */
export default async function BrandsPage() {
  const { brands } = await api.marques();
  const bySector = new Map<number, typeof brands>();
  for (const b of brands) bySector.set(b.sector, [...(bySector.get(b.sector) ?? []), b]);
  return (
    <div className="page dog-ear">
      <Reveal>
        <p className="eyebrow">the brands · a field note</p>
        <h1 style={{ marginTop: ".4rem" }}>What we log, and on what terms</h1>
        <div style={{ maxWidth: "62ch", marginTop: "1rem", display: "grid", gap: "0.9rem" }}>
          <p className="lede">SPOT is an observation notebook. You write down what you cross in the street: a truck, a sign, a can, a car at the lights. The brands you log have not authorised anything, and we ask nothing of them.</p>
          <p>
            <strong>Names and logos are used for identification only.</strong> They belong to their owners. Their presence here says that you saw them in the street, nothing more.
          </p>
          <p>
            <strong>We have no affiliation.</strong> No partnership, no endorsement, no suggestion of either. Plates are named after sectors, never after brands.
          </p>
          <p>
            <strong>Any brand that asks leaves the game within 48 hours</strong>, no discussion. Technically, withdrawal takes one transaction and a few minutes. Cards already earned stay in players&apos; notebooks, we do not rewrite their history, but no fragment of that brand is distributed from that moment on.
          </p>
          <p>
            For a withdrawal request or any question: <span className="mono">brands@spot.example</span> (final address published before launch).
          </p>
          <p className="legend" style={{ fontSize: ".9rem" }}>
            What you receive is not a share: it is economic exposure to a listed value, through a tokenised note issued by a third party. Details on the{" "}
            <Link href="/legal" className="wobble-underline">
              legal page
            </Link>
            .
          </p>
        </div>
      </Reveal>

      <hr className="rule" style={{ margin: "2.2rem 0 1rem" }} />
      <Reveal delay={0.15}>
        <h2 style={{ fontSize: "1.25rem" }}>Active brands and today&apos;s coefficient</h2>
        <p className="legend" style={{ margin: ".4rem 0 1.4rem", fontSize: ".9rem", maxWidth: "56ch" }}>
          The coefficient is recomputed every night from what the world logged over the last seven days. What everyone sees is worth less; what nobody finds is worth more. It is shown before the shot, never after.
        </p>
      </Reveal>
      <Stagger gap={0.05}>
        {[...bySector.entries()].map(([sector, list]) => (
          <Item key={sector}>
            <section style={{ marginBottom: "1.6rem" }}>
              <h3 className="eyebrow" style={{ marginBottom: ".6rem" }}>
                {SECTEURS[sector] ?? `sector ${sector}`}
              </h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: ".5rem 1.5rem" }}>
                {list.map((b) => (
                  <li key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--rule-hair)", padding: ".4rem 0" }}>
                    <Link href={`/prise/${b.id}`} aria-label={`Log ${b.name}`} style={{ display: "flex", alignItems: "center", gap: ".55rem" }}>
                      <BrandLogo brand={b.name} size={24} />
                      <Manuscrit text={b.name} size={1.3} />
                    </Link>
                    <span className="mono">{coeff(b.rarity)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </Item>
        ))}
      </Stagger>
    </div>
  );
}
