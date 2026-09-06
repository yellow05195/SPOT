import Link from "next/link";
import { api, brandName } from "@/lib/api";
import { usd, duree, coeff } from "@/lib/format";
import { Manuscrit } from "@/components/Manuscrit";
import { CoinsPhoto } from "@/components/CoinsPhoto";
import { BrandLogo } from "@/components/BrandLogo";
import { Wallet } from "@/components/Wallet";
import { PinnedNote } from "@/components/PinnedNote";
import { Reveal, Stagger, Lift } from "@/components/Reveal";
import { Hero } from "@/components/Hero";
import { Ticker } from "@/components/Ticker";
import { WorldMap } from "@/components/WorldMap";
import { LiveMap } from "@/components/LiveMap";
import "@/components/fiche.css";

export const dynamic = "force-dynamic";

/**
 * `/`: the hero, then today's hunt: a notebook page open at today's date, five empty album slots,
 * the field map, and a permanent status line at the foot of the page.
 */
export default async function HuntPage() {
  const [chasse, { fiches: latest }, { brands }, stats] = await Promise.all([api.chasse(), api.terrain({}), api.marques(), api.stats()]);
  const now = new Date();
  const countries = new Set(latest.map((f) => f.city.split(", ").pop())).size;
  return (
    <div className="page dog-ear">
      <Hero brands={chasse.brands} />

      <Ticker items={latest.slice(0, 14).map((f) => ({ id: f.id, brand: brandName(brands, f.brandId), city: f.city, date: f.date, rarity: f.rarity }))} countries={Math.max(countries, stats.diversiteGeographique)} today={chasse.sightingsToday} />

      <section id="hunt" style={{ paddingTop: "2.6rem" }}>
        <Reveal as="header" className="page-head" style={{ alignItems: "flex-end" }}>
          <div>
            <p className="eyebrow" style={{ marginBottom: ".4rem" }}>
              today&apos;s hunt · full coefficient until midnight UTC
            </p>
            <h2 style={{ fontSize: "1.8rem" }}>Five brands to find <em className="accent">today</em></h2>
          </div>
          <span className="mono legend">rearms in {duree(chasse.resetInSeconds)}</span>
        </Reveal>
        <hr className="rule" style={{ margin: "0.6rem 0 1.6rem" }} />

        {chasse.budgetExhausted && (
          <Reveal delay={0.1} style={{ marginBottom: "1.5rem" }}>
            <PinnedNote tone="green">today&apos;s budget is spent, you still earn the card, not the fragment. Rearms in {duree(chasse.resetInSeconds)}.</PinnedNote>
          </Reveal>
        )}

        <Stagger className="slots" delay={0.1}>
          {chasse.brands.map((b) => (
            <Lift key={b.id}>
              <Link href={`/prise/${b.id}`} className="slot" aria-label={`Log ${b.name}, coefficient ${coeff(b.rarity)}`}>
                <div className="slot-frame">
                  <CoinsPhoto hollow />
                  <div className="slot-inner">
                    <BrandLogo brand={b.name} size={64} />
                    <span className="mono legend slot-hint">log it</span>
                  </div>
                </div>
                <div className="slot-caption">
                  <Manuscrit text={b.name} size={1.5} />
                  <span className="coeff">{coeff(b.rarity)}</span>
                </div>
              </Link>
            </Lift>
          ))}
        </Stagger>

        <Reveal delay={0.4}>
          <p className="legend" style={{ marginTop: "1.8rem", maxWidth: "60ch" }}>
            A brand outside the hunt can be logged too. It pays 30 % of the coefficient, but the card is identical and completes your plate.{" "}
            <Link href="/marques" className="wobble-underline">
              all brands
            </Link>
          </p>
        </Reveal>
      </section>

      <section style={{ paddingTop: "3rem" }}>
        <Reveal as="header" className="page-head" style={{ alignItems: "flex-end" }}>
          <div>
            <p className="eyebrow" style={{ marginBottom: ".4rem" }}>
              the field · where the last cards were taken
            </p>
            <h2 style={{ fontSize: "1.8rem" }}>The world, <em className="accent">one street at a time</em></h2>
          </div>
          <Link href="/terrain" className="btn-quiet">
            open the field →
          </Link>
        </Reveal>
        <Reveal delay={0.15}>
          <LiveMap pins={latest.map((f) => ({ id: f.id, city: f.city, brand: brandName(brands, f.brandId), hot: f.inHunt }))} height={460} fallback={<WorldMap pins={latest.map((f) => ({ city: f.city, hot: f.inHunt }))} height={460} />} />
        </Reveal>
      </section>

      <Reveal delay={0.2} style={{ marginTop: "2.6rem", display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <Wallet />
        <span className="legend" style={{ fontSize: ".9rem" }}>Sign the notebook to open it at your page.</span>
      </Reveal>

      <footer className="mono legend status-line">
        daily budget {usd(chasse.budgetUsd)} · spent {usd(chasse.spentUsd)} · {chasse.sightingsToday} cards logged · rearms in {duree(chasse.resetInSeconds)}
      </footer>

    </div>
  );
}
