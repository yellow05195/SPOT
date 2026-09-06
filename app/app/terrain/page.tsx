import Link from "next/link";
import { api, brandName, SECTEURS } from "@/lib/api";
import { Fiche } from "@/components/Fiche";
import { Reveal, Stagger, Lift } from "@/components/Reveal";
import { WorldMap } from "@/components/WorldMap";
import { LiveMap } from "@/components/LiveMap";
import { jitter } from "@/lib/format";
import "@/components/fiche.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Field" };

/**
 * `/terrain`: the world feed: a pencil map of where the cards were taken, then a pin board with the
 * cards askew, slightly overlapping, with pins. Filter by brand, sector, country. No likes, no comments.
 */
export default async function FieldPage({ searchParams }: { searchParams: Promise<{ marque?: string; secteur?: string; pays?: string }> }) {
  const q = await searchParams;
  const [{ fiches }, { brands }] = await Promise.all([api.terrain(q), api.marques()]);
  const countries = [...new Set(fiches.map((f) => f.city.split(", ").pop()).filter(Boolean))] as string[];
  const select: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: ".8rem", width: "auto", color: "var(--ink)" };
  return (
    <div className="page">
      <Reveal as="header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <p className="eyebrow">the field · live</p>
          <h1 style={{ marginTop: ".4rem" }}>The world, seen through its listed companies</h1>
          <p className="lede" style={{ marginTop: ".5rem" }}>
            Photographed by strangers, right now. You look, that&apos;s all.
          </p>
        </div>
        <form className="mono" style={{ display: "flex", gap: ".8rem", flexWrap: "wrap", alignItems: "baseline" }}>
          <label>
            brand{" "}
            <select name="marque" defaultValue={q.marque ?? ""} className="field" style={select}>
              <option value="">all</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            sector{" "}
            <select name="secteur" defaultValue={q.secteur ?? ""} className="field" style={select}>
              <option value="">all</option>
              {Object.entries(SECTEURS).map(([id, n]) => (
                <option key={id} value={id}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            country{" "}
            <select name="pays" defaultValue={q.pays ?? ""} className="field" style={select}>
              <option value="">all</option>
              {countries.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-quiet" type="submit">
            filter
          </button>
        </form>
      </Reveal>
      <hr className="rule" style={{ margin: "1rem 0 1.4rem" }} />

      <Reveal delay={0.1} style={{ marginBottom: "2.4rem" }}>
        <LiveMap pins={fiches.map((f) => ({ id: f.id, city: f.city, brand: brandName(brands, f.brandId), hot: f.inHunt }))} height={520} fallback={<WorldMap pins={fiches.map((f) => ({ city: f.city, hot: f.inHunt }))} height={520} />} />
      </Reveal>

      {fiches.length === 0 ? (
        <p className="legend">
          Nothing pinned with that filter.{" "}
          <Link href="/terrain" className="wobble-underline">
            see everything
          </Link>
        </p>
      ) : (
        <Stagger className="wall" gap={0.05}>
          {fiches.map((f) => {
            const j = jitter(f.id, 6, 3);
            return (
              <Lift key={f.id} rotate={j.rot} style={{ position: "relative", x: j.dx, y: j.dy, justifySelf: "center", width: "100%", maxWidth: 240 }}>
                <span className="pin" style={{ left: "50%", top: -5, marginLeft: -6, zIndex: 2 }} aria-hidden="true" />
                <Fiche id={f.id} brand={brandName(brands, f.brandId)} image={f.image} date={new Date(f.date)} city={f.city} rarity={f.rarity} size="sm" stamp={f.inHunt ? { text: "daily hunt", tone: "green" } : null} />
              </Lift>
            );
          })}
        </Stagger>
      )}
    </div>
  );
}
