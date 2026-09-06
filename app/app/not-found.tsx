import Link from "next/link";

export const metadata = { title: "Not found" };

/** `404`: a page that is not in the notebook. Same register as the rest of the site, two ways out. */
export default function NotFound() {
  return (
    <div className="page" style={{ minHeight: "70vh", display: "grid", placeItems: "center", textAlign: "center" }}>
      <div style={{ display: "grid", gap: "1.2rem", justifyItems: "center", maxWidth: "46ch" }}>
        <p className="eyebrow">404 · not on the map</p>
        <h1 style={{ fontFamily: "var(--font-balloon), var(--font-display)", fontWeight: 400, fontSize: "clamp(3.4rem, 10vw, 7rem)", lineHeight: 0.95, letterSpacing: "0.01em", color: "var(--accent)", textShadow: "0 4px 0 #9a8b00, 0 12px 28px rgba(0, 0, 0, 0.55)" }}>
          Nothing here.
        </h1>
        <p className="legend" style={{ fontSize: "1.05rem" }}>This page is not in the notebook. It may have moved, or the link was never a real one.</p>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center", alignItems: "center", marginTop: ".4rem" }}>
          <Link href="/" className="btn">
            back to today&apos;s hunt
          </Link>
          <Link href="/terrain" className="btn-quiet">
            open the field
          </Link>
        </div>
      </div>
    </div>
  );
}
