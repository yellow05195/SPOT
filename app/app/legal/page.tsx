import { Reveal } from "@/components/Reveal";

export const metadata = { title: "Legal" };

/** `/legal`: jurisdiction restrictions and the nature of Stock Tokens. Never "you own a share". */
export default function LegalPage() {
  return (
    <div className="page dog-ear">
      <Reveal>
        <p className="eyebrow">legal · before you play</p>
        <h1 style={{ marginTop: ".4rem" }}>What you need to know</h1>
        <div style={{ maxWidth: "62ch", marginTop: "1rem", display: "grid", gap: "0.9rem" }}>
          <h2 style={{ fontSize: "1.1rem" }}>What you receive</h2>
          <p>
            A fragment of a Robinhood <em>Stock Token</em>. It is <strong>not a share</strong>. It is a tokenised debt note, issued by Robinhood Assets (Jersey) Limited, giving you <strong>economic exposure</strong> to the corresponding listed value: no voting right, no title of ownership. Dividends and splits are handled by a multiplier written on-chain.
          </p>
          <p>SPOT issues nothing. The vault buys these tokens in advance and hands them out in small fragments. Nothing is minted, ever.</p>
          <h2 style={{ fontSize: "1.1rem" }}>Where we do not play</h2>
          <p>
            Robinhood Stock Tokens are not offered to people residing in the <strong>United States</strong>, <strong>Canada</strong>, the <strong>United Kingdom</strong> or <strong>Switzerland</strong>, nor to persons and countries under OFAC sanctions. SPOT enforces these restrictions at the door, on the network address, and asks every player to confirm they are not a <em>US person</em>. There is no way to continue otherwise, and we will not offer one.
          </p>
          <h2 style={{ fontSize: "1.1rem" }}>What this is not</h2>
          <p>SPOT is a collecting game. Fragments are small, around fifty cents per sighting. No promise is made about their future value, and nobody here advises anyone on anything.</p>
          <h2 style={{ fontSize: "1.1rem" }}>What the contract guarantees</h2>
          <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
            <li>a fixed daily budget, decided the day before, never exceeded;</li>
            <li>an inventory readable by anyone, at all times, on the proof-of-reserve page;</li>
            <li>code deployed once and for all: no proxy, no upgrade;</li>
            <li>a signed claim voucher that always executes, whatever the team does.</li>
          </ul>
          <p className="legend" style={{ fontSize: ".9rem" }}>The detail of these choices is in LEGAL.md and SECURITY.md, published with the code.</p>
        </div>
      </Reveal>
    </div>
  );
}
