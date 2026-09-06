"use client";

import Link from "next/link";
import { useEffect } from "react";

/** The route error boundary: something broke while preparing a page. A retry, and a way back to the notebook. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="page" style={{ minHeight: "70vh", display: "grid", placeItems: "center", textAlign: "center" }}>
      <div style={{ display: "grid", gap: "1.2rem", justifyItems: "center", maxWidth: "46ch" }}>
        <p className="eyebrow">something slipped</p>
        <h1 style={{ fontFamily: "var(--font-balloon), var(--font-display)", fontWeight: 400, fontSize: "clamp(3rem, 9vw, 6rem)", lineHeight: 0.95, letterSpacing: "0.01em", color: "var(--accent)", textShadow: "0 4px 0 #9a8b00, 0 12px 28px rgba(0, 0, 0, 0.55)" }}>
          The page tore.
        </h1>
        <p className="legend" style={{ fontSize: "1.05rem" }}>This page could not be prepared. Nothing of yours was lost: cards and fragments live on the chain, not in this tab.</p>
        {error.digest && <p className="mono legend" style={{ fontSize: ".72rem" }}>ref {error.digest}</p>}
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center", alignItems: "center", marginTop: ".4rem" }}>
          <button className="btn" onClick={reset}>
            try again
          </button>
          <Link href="/" className="btn-quiet">
            back to today&apos;s hunt
          </Link>
        </div>
      </div>
    </div>
  );
}
