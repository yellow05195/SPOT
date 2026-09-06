import { api } from "@/lib/api";
import { Tampon } from "@/components/Tampon";
import { BrandLogo } from "@/components/BrandLogo";
import { Reveal } from "@/components/Reveal";
import { usd } from "@/lib/format";
import { VaultRefresh } from "@/components/VaultRefresh";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proof of reserve" };

/** `/vault`: an inventory ledger: thin rules, tabular mono, right-aligned. Refreshed every 30 s. */
export default async function VaultPage() {
  const [v, stats] = await Promise.all([api.vault(), api.stats()]);
  const totalUsd = v.brands.reduce((s, b) => s + (b.usdValue ?? 0), 0);
  const coverageH = v.budgetUsd > 0 ? (totalUsd / v.budgetUsd) * 24 : null; // hours of cover at the daily budget's pace
  const spent = v.status === "BUDGET SPENT" || (v.status as string) === "BUDGET ÉPUISÉ";
  const stat = (label: string, value: string) => (
    <div>
      <dt className="legend">{label}</dt>
      <dd style={{ margin: 0, fontSize: "1.25rem" }}>{value}</dd>
    </div>
  );
  return (
    <div className="page">
      <VaultRefresh />
      <Reveal as="header" className="page-head">
        <div>
          <p className="eyebrow">proof of reserve · on-chain</p>
          <h1 style={{ marginTop: ".4rem" }}>Nothing is <em className="accent">ever</em> minted</h1>
          <p className="lede" style={{ marginTop: ".5rem" }}>
            A fragment can only be claimed if the vault already holds the tokens. Everything is readable on the chain, at all times.
          </p>
        </div>
        <Tampon text={spent ? "budget spent" : "stocked"} tone={spent ? "red" : "green"} style={{ fontSize: 13 }} />
      </Reveal>
      <hr className="rule" style={{ margin: "1rem 0 1.4rem" }} />

      <Reveal delay={0.1}>
        <dl className="mono" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: ".8rem 1.5rem", margin: "0 0 1.8rem" }}>
          {stat("daily budget", usd(v.budgetUsd))}
          {stat("spent today", usd(v.spentUsd))}
          {stat("total inventory", usd(totalUsd))}
          {stat("cover", coverageH === null || !isFinite(coverageH) ? "n/a" : `${coverageH.toFixed(0)} h`)}
          {stat("day", String(v.day))}
        </dl>
      </Reveal>

      <Reveal delay={0.2} className="register">
        <table>
          <thead>
            <tr>
              <th>brand</th>
              <th>units in stock</th>
              <th>value</th>
              <th>token</th>
            </tr>
          </thead>
          <tbody>
            {v.brands.map((b) => (
              <tr key={b.brandId}>
                <td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: ".5rem" }}>
                    <BrandLogo brand={b.name} size={20} />
                    {b.name}
                  </span>
                </td>
                <td>{b.units}</td>
                <td>{b.usdValue === null ? "n/a" : usd(b.usdValue)}</td>
                <td>
                  <a href={b.explorer} target="_blank" rel="noreferrer" className="wobble-underline">
                    {b.token.slice(0, 8)}…{b.token.slice(-4)}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Reveal>

      <p className="mono legend" style={{ marginTop: "1.5rem", fontSize: ".72rem" }}>
        vault{" "}
        {v.explorer ? (
          <a href={v.explorer} target="_blank" rel="noreferrer" className="wobble-underline">
            {v.vault}
          </a>
        ) : (
          "not deployed"
        )}{" "}
        · refreshed every 30 s
      </p>

      <hr className="rule" style={{ margin: "2.4rem 0 1rem" }} />
      <Reveal delay={0.3}>
        <p className="eyebrow">the numbers that say whether it works</p>
        <h2 style={{ fontSize: "1.25rem", marginTop: ".4rem" }}>Public, even when they are bad</h2>
        <p className="legend" style={{ margin: ".4rem 0 1rem", fontSize: ".9rem" }}>
          The first one is the metric of truth: while it sits at 1, nothing else matters.
        </p>
        <div className="register">
          <table>
            <tbody>
              <tr>
                <td>sightings per player, 7 days</td>
                <td>{stats.prisesParJoueur7j.toFixed(2)}</td>
                <td className="legend">healthy &gt; 5</td>
              </tr>
              <tr>
                <td>active players, 7 days</td>
                <td>{stats.joueursActifs7j}</td>
                <td className="legend"></td>
              </tr>
              <tr>
                <td>sightings per day (last 7)</td>
                <td>{stats.prisesParJour.join(" · ")}</td>
                <td className="legend"></td>
              </tr>
              <tr>
                <td>vision escalation rate</td>
                <td>{(stats.tauxEscalade * 100).toFixed(1)} %</td>
                <td className="legend">10–20 %</td>
              </tr>
              <tr>
                <td>accounts above 85 risk</td>
                <td>{(stats.comptesRisqueEleve * 100).toFixed(1)} %</td>
                <td className="legend">&lt; 3 %</td>
              </tr>
              <tr>
                <td>geographic diversity</td>
                <td>{stats.diversiteGeographique} countries</td>
                <td className="legend">&gt; 20</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Reveal>
    </div>
  );
}
