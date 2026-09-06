import { Tampon } from "@/components/Tampon";

export const metadata = { title: "Out of area" };

/**
 * `/indisponible`: the geo-block. Many people will only ever see this screen.
 * A notebook page, an OUT OF AREA stamp across it, the text. No bypass button, no mention of VPNs, nothing.
 */
export default function OutOfAreaPage() {
  return (
    <div className="page dog-ear" data-hors-zone style={{ minHeight: "70vh", display: "grid", placeItems: "center" }}>
      <div style={{ position: "relative", maxWidth: "52ch", padding: "3.2rem 1.6rem", background: "var(--card)", border: "1px solid var(--rule)", boxShadow: "4px 4px 0 var(--shadow)" }}>
        <Tampon text="out of area" tone="red" across style={{ top: "18%" }} />
        <p style={{ marginTop: "3rem", fontSize: "1.05rem" }}>Robinhood Stock Tokens are not offered to people residing in the United States, Canada, the United Kingdom or Switzerland.</p>
        <p className="legend" style={{ marginTop: "1rem" }}>SPOT is therefore not available from where you are. Thank you for stopping by.</p>
        <p className="mono legend" style={{ marginTop: "2rem", fontSize: ".72rem" }}>SPOT · field notebook</p>
      </div>
    </div>
  );
}
