import Link from "next/link";
import { api, brandName } from "@/lib/api";
import { Reglette } from "@/components/Reglette";
import { Tampon } from "@/components/Tampon";
import { BrandLogo } from "@/components/BrandLogo";
import { Reveal, Stagger, Item } from "@/components/Reveal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plates" };

/** `/planches`: herbarium plates: sectors, never brands. */
export default async function PlatesPage() {
  const [{ plates }, { brands }] = await Promise.all([api.planches(), api.marques()]);
  const now = Math.floor(Date.now() / 1000);
  return (
    <div className="page dog-ear">
      <Reveal>
        <p className="eyebrow">plates · one per week</p>
        <h1 style={{ marginTop: ".4rem" }}>The plates</h1>
        <p className="lede" style={{ margin: "0.7rem 0 1.5rem" }}>
          Seven brands from one sector. Bring the seven together and the plate is sealed: the cards are glued in for good, a unique object is minted, and a bonus is paid from a reserve kept apart from the daily budget.
        </p>
      </Reveal>
      <hr className="rule" />
      <Stagger>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {plates.map((p) => {
            const open = p.opensAt <= now && !p.closed;
            return (
              <Item key={p.id}>
                <li style={{ padding: "1.4rem 0", borderBottom: "1px solid var(--rule-hair)" }}>
                  <Link href={`/planches/${p.id}`} style={{ color: "inherit", display: "grid", gridTemplateColumns: "1fr auto", gap: "1rem", alignItems: "center" }}>
                    <div>
                      <h2 style={{ fontSize: "1.35rem" }}>{p.name}</h2>
                      <div style={{ display: "flex", gap: ".35rem", marginTop: ".6rem", flexWrap: "wrap" }}>
                        {p.brandIds.map((id) => (
                          <BrandLogo key={id} brand={brandName(brands, id)} size={26} />
                        ))}
                      </div>
                      <p className="mono legend" style={{ marginTop: ".6rem" }}>
                        7 slots · {p.platesSealed} sealed in this series · next bonus ${(300 / (1 + p.platesSealed)).toFixed(0)}
                      </p>
                      <div style={{ maxWidth: 320, marginTop: ".9rem" }}>
                        <Reglette total={7} value={0} />
                      </div>
                    </div>
                    {p.closed ? <Tampon text="series closed" tone="red" /> : !open ? <span className="mono legend">opens soon</span> : <Tampon text="open" tone="green" />}
                  </Link>
                </li>
              </Item>
            );
          })}
        </ul>
      </Stagger>
    </div>
  );
}
