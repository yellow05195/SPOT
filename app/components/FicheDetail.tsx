"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useAccount, useSignMessage } from "wagmi";
import { api, brandName, DEMO, API_URL, type BrandDto, type FicheDto } from "@/lib/api";
import { demo } from "@/lib/demo";
import { Fiche } from "./Fiche";
import { LoadingFrame } from "./LoadingFrame";
import { Reveal } from "./Reveal";
import { Tilt } from "./Tilt";
import { useNotes } from "./Notes";
import { EXPLORER } from "@/lib/wagmi";
import { dateRoman, heure, coeff } from "@/lib/format";

export function FicheDetail({ id, brands }: { id: number; brands: BrandDto[] }) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { note } = useNotes();
  const [fiche, setFiche] = useState<FicheDto | null | undefined>(undefined);
  const [back, setBack] = useState(false);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    const wallet = address ?? "0x000000000000000000000000000000000000dEaD";
    api.carnet(wallet).then((r) => {
      const list = DEMO ? demo.fiches : r.fiches;
      setFiche(list.find((f) => f.id === id) ?? null);
    });
  }, [id, address]);

  if (fiche === undefined) {
    return (
      <div className="page" style={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
        <LoadingFrame />
      </div>
    );
  }
  if (fiche === null || deleted) {
    return (
      <div className="page">
        <p className="legend">
          {deleted ? "The image has been deleted. The fragment stays yours." : "Card not found."}{" "}
          <Link href="/carnet" className="wobble-underline">
            back to the notebook
          </Link>
        </p>
      </div>
    );
  }
  const brand = brandName(brands, fiche.brandId);
  const share = `${typeof window !== "undefined" ? window.location.origin : ""}/api/og/${fiche.id}?marque=${encodeURIComponent(brand)}&ville=${encodeURIComponent(fiche.city)}&date=${encodeURIComponent(fiche.date)}&coeff=${fiche.rarity}&img=${encodeURIComponent(fiche.image ?? "")}`;

  async function remove() {
    if (!address) return note("sign the notebook first", "red");
    const message = `SPOT : je supprime l'image de ma fiche n° ${fiche!.id}. Le fragment reste acquis.`;
    try {
      const signature = await signMessageAsync({ message });
      const res = await fetch(`${API_URL}/fiche/${fiche!.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: address, signature }) });
      if (res.ok) {
        setDeleted(true);
        note("image deleted, fragment kept", "green");
      } else note("deletion refused", "red");
    } catch {
      note("signature cancelled");
    }
  }

  const stamp = fiche.paid === false ? { text: "over budget", tone: "red" as const } : fiche.inHunt ? { text: "daily hunt", tone: "green" as const } : { text: "logged", tone: "green" as const };

  return (
    <div className="page" style={{ display: "grid", gap: "1.25rem", justifyItems: "center" }}>
      <Reveal style={{ width: "100%", maxWidth: 440, perspective: 1200 }}>
        <button onClick={() => setBack((b) => !b)} aria-pressed={back} aria-label={back ? "Show the front" : "Show the back of the card"} style={{ background: "none", border: 0, padding: 0, width: "100%", cursor: "pointer", textAlign: "left" }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={back ? "back" : "front"} initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} exit={{ rotateY: -90, opacity: 0 }} transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}>
              {!back ? (
                <Tilt max={7}>
                  <Fiche id={fiche.id} brand={brand} image={fiche.image} date={new Date(fiche.date)} city={fiche.city} rarity={fiche.rarity} size="lg" stamp={stamp} />
                </Tilt>
              ) : (
                <div className="fiche fiche-lg" style={{ border: "1px solid var(--rule)", padding: "1rem", backgroundImage: "linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px)", backgroundSize: "2.5mm 2.5mm", boxShadow: "3px 3px 0 var(--shadow)" }}>
                  <p className="eyebrow">back · proof</p>
                  <hr className="rule" style={{ margin: ".6rem 0" }} />
                  <dl className="mono" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: ".4rem .9rem", fontSize: ".72rem", wordBreak: "break-all" }}>
                    <dt className="legend">sha-256</dt>
                    <dd style={{ margin: 0 }}>{fiche.imageHash}</dd>
                    <dt className="legend">date</dt>
                    <dd style={{ margin: 0 }}>
                      {dateRoman(new Date(fiche.date))} · {heure(new Date(fiche.date))}
                    </dd>
                    <dt className="legend">place</dt>
                    <dd style={{ margin: 0 }}>{fiche.city}</dd>
                    <dt className="legend">coefficient</dt>
                    <dd style={{ margin: 0 }}>{coeff(fiche.rarity)}</dd>
                    <dt className="legend">hunt</dt>
                    <dd style={{ margin: 0 }}>{fiche.inHunt ? "yes" : "no"}</dd>
                    <dt className="legend">fragment</dt>
                    <dd style={{ margin: 0 }}>{fiche.paid === false ? "none (over budget)" : fiche.paid ? `$${fiche.usdValue.toFixed(2)}` : "pending"}</dd>
                    <dt className="legend">explorer</dt>
                    <dd style={{ margin: 0 }}>
                      <a href={EXPLORER} target="_blank" rel="noreferrer" className="wobble-underline">
                        robinhoodchain.blockscout.com
                      </a>
                    </dd>
                  </dl>
                  <p className="mono legend" style={{ marginTop: "auto", fontSize: ".62rem" }}>
                    tap to flip back
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </button>
      </Reveal>

      {/* The share button sits right under the card, never in a menu */}
      <Reveal delay={0.15} style={{ display: "grid", gap: ".8rem", justifyItems: "center" }}>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
          <button
            className="btn"
            onClick={async () => {
              if (navigator.share) await navigator.share({ title: `${brand} · SPOT`, text: `${brand}, ${dateRoman(new Date(fiche.date))}, ${fiche.city}`, url: share }).catch(() => undefined);
              else {
                await navigator.clipboard.writeText(share).catch(() => undefined);
                note("card link copied", "green");
              }
            }}
          >
            share the card
          </button>
          <button className="btn-quiet" onClick={remove}>
            delete the image
          </button>
        </div>
        <p className="legend" style={{ fontSize: ".85rem", maxWidth: "46ch", textAlign: "center" }}>
          Deleting really removes the image from our servers. The hash stays on-chain, the fragment stays yours.
        </p>
      </Reveal>
    </div>
  );
}
