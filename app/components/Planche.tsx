"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { api, brandName, DEMO, type BrandDto, type FicheDto, type PlateDto } from "@/lib/api";
import { demo } from "@/lib/demo";
import { Fiche } from "./Fiche";
import { Manuscrit } from "./Manuscrit";
import { CoinsPhoto } from "./CoinsPhoto";
import { BrandLogo } from "./BrandLogo";
import { Reglette } from "./Reglette";
import { Tampon } from "./Tampon";
import { Wallet } from "./Wallet";
import { Reveal, Stagger, Lift } from "./Reveal";
import { useNotes } from "./Notes";
import { jitter } from "@/lib/format";
import { PLATES_ADDRESS, platesAbi } from "@/lib/contracts";

/**
 * A herbarium plate: seven slots on an irregular grid (±4 px, ±1.5°, derived from the id, stable).
 * Empty: fine dashes, hollow corners, the name in pencil. Filled: the card, reduced.
 * Below, the ruler; with all seven, the SEALED stamp and a double rule.
 */
export function Planche({ plate, brands }: { plate: PlateDto; brands: BrandDto[] }) {
  const { address } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const { note } = useNotes();
  const [fiches, setFiches] = useState<FicheDto[]>([]);
  const [sealed, setSealed] = useState(false);

  useEffect(() => {
    const wallet = address ?? (DEMO ? "0x000000000000000000000000000000000000dEaD" : null);
    if (!wallet) return;
    api.carnet(wallet).then((r) => setFiches(DEMO ? demo.fiches : r.fiches));
  }, [address]);

  const slots = useMemo(
    () =>
      plate.brandIds.map((bid, i) => {
        const owned = fiches.find((f) => f.brandId === bid) ?? null;
        return { brandId: bid, name: brandName(brands, bid), fiche: owned, j: jitter(`${plate.id}-${i}`, 4, 1.5) };
      }),
    [plate, brands, fiches],
  );
  const filled = slots.filter((s) => s.fiche).length;
  const complete = filled === 7;

  async function seal() {
    if (!address) return note("sign the notebook first", "red");
    try {
      const ids = slots.map((s) => BigInt(s.fiche?.id ?? 0)) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint];
      await writeContractAsync({ address: PLATES_ADDRESS, abi: platesAbi, functionName: "seal", args: [plate.id, ids] });
      setSealed(true);
      note("plate sealed", "green");
    } catch {
      note("sealing cancelled", "red");
    }
  }

  return (
    <div className="page dog-ear">
      <Reveal as="header" className="page-head" style={{ alignItems: "baseline" }}>
        <div>
          <p className="eyebrow">plate no. {String(plate.id).padStart(3, "0")}</p>
          <h1 style={{ marginTop: ".4rem" }}>{plate.name}</h1>
        </div>
        <span className="mono legend">
          {filled} / 7
        </span>
      </Reveal>
      <hr className={sealed || complete ? "rule rule-double" : "rule"} style={{ margin: "0.8rem 0 1.6rem" }} />

      <div style={{ position: "relative", padding: sealed ? "1rem" : 0, outline: sealed ? "1px solid var(--rule)" : "none", outlineOffset: 3, border: sealed ? "1px solid var(--rule)" : "none" }}>
        <Stagger className="herbier" gap={0.07}>
          {slots.map((s) => (
            <Lift key={s.brandId} className="herbier-slot" rotate={s.j.rot} style={{ x: s.j.dx, y: s.j.dy }}>
              {s.fiche ? (
                <Fiche id={s.fiche.id} brand={s.name} image={s.fiche.image} date={new Date(s.fiche.date)} city={s.fiche.city} rarity={s.fiche.rarity} size="sm" />
              ) : (
                <div className="herbier-empty" aria-label={`${s.name}, empty slot`}>
                  <div className="herbier-frame">
                    <CoinsPhoto hollow />
                    <BrandLogo brand={s.name} size={40} style={{ opacity: 0.45, filter: "grayscale(1)" }} />
                  </div>
                  <div style={{ marginTop: ".4rem" }}>
                    <Manuscrit text={s.name} pencil size={1.15} />
                  </div>
                </div>
              )}
            </Lift>
          ))}
        </Stagger>
        {sealed && <Tampon text="plate sealed" tone="green" across drop />}
      </div>

      <Reveal delay={0.4}>
        <div style={{ marginTop: "2.2rem", maxWidth: 480 }}>
          <Reglette total={7} value={filled} />
        </div>
        <p className="mono legend" style={{ marginTop: "1.6rem" }}>
          {filled} / 7 · next bonus ${(300 / (1 + plate.platesSealed)).toFixed(0)} (decreasing, floor $5)
        </p>
        <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
          {!address ? <Wallet /> : null}
          {complete && !sealed && address && (
            <button className="btn" onClick={seal} disabled={isPending}>
              {isPending ? "sealing…" : "seal the plate"}
            </button>
          )}
          {complete && !sealed && (
            <p className="legend" style={{ fontSize: ".85rem", maxWidth: "44ch" }}>
              Sealing glues the seven cards in for good: they leave your notebook and become the plate. You can also wait for a finer card.
            </p>
          )}
        </div>
      </Reveal>

      <style jsx global>{`
        .herbier {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1.6rem 1rem;
          justify-items: center;
        }
        @media (min-width: 640px) {
          .herbier {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }
        .herbier-slot {
          width: 100%;
          max-width: 200px;
        }
        .herbier-frame {
          position: relative;
          aspect-ratio: 3 / 4;
          border: 1px dashed var(--pencil);
          opacity: 0.75;
          display: grid;
          place-items: center;
        }
      `}</style>
    </div>
  );
}
