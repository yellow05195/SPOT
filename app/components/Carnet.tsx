"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useAccount } from "wagmi";
import { api, brandName, DEMO, type BrandDto, type FicheDto } from "@/lib/api";
import { Fiche } from "./Fiche";
import { Wallet } from "./Wallet";
import { LoadingFrame } from "./LoadingFrame";
import { Reveal } from "./Reveal";
import { dateRoman } from "@/lib/format";
import { demo } from "@/lib/demo";

function perPage(width: number): number {
  if (width >= 1240) return 6; // double page with a centre fold
  if (width >= 640) return 4;
  return 2; // mobile: full-width card, two per page, stacked
}

/**
 * The notebook: 2 cards per page on mobile, 4 on tablet, 6 on desktop as a double page with a
 * centre fold. Swipe or use the arrow keys; the page lifts and turns.
 */
export function Carnet({ brands }: { brands: BrandDto[] }) {
  const { address } = useAccount();
  const reduce = useReducedMotion();
  const wallet = address ?? (DEMO ? "0x000000000000000000000000000000000000dEaD" : null);
  const [fiches, setFiches] = useState<FicheDto[] | null>(null);
  const [page, setPage] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [n, setN] = useState(2);
  const touch = useRef<number | null>(null);

  useEffect(() => {
    const on = () => setN(perPage(window.innerWidth));
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  useEffect(() => {
    if (!wallet) return;
    let alive = true;
    api.carnet(wallet).then((r) => alive && setFiches(DEMO ? demo.fiches : r.fiches));
    return () => {
      alive = false;
    };
  }, [wallet]);

  const pages = useMemo(() => {
    if (!fiches) return [];
    const out: FicheDto[][] = [];
    for (let i = 0; i < fiches.length; i += n) out.push(fiches.slice(i, i + n));
    return out.length ? out : [[]];
  }, [fiches, n]);

  const go = (d: 1 | -1) => {
    const target = page + d;
    if (target < 0 || target >= pages.length) return;
    setDir(d);
    setPage(target);
  };

  if (!wallet) {
    return (
      <div className="page">
        <Reveal>
          <p className="eyebrow">your notebook</p>
          <h1 style={{ marginTop: ".4rem" }}>Open it at your page</h1>
          <p className="lede" style={{ margin: "0.8rem 0 1.5rem" }}>
            Sign the notebook to see your cards: your streets, your days, what you found.
          </p>
          <Wallet />
        </Reveal>
      </div>
    );
  }
  if (!fiches) {
    return (
      <div className="page" style={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
        <LoadingFrame label="opening the notebook" />
      </div>
    );
  }
  const current = pages[page] ?? [];
  const first = current[0];
  const last = current[current.length - 1];
  const periode = first && last ? (first.id === last.id ? dateRoman(new Date(first.date)) : `${dateRoman(new Date(last.date))} to ${dateRoman(new Date(first.date))}`) : "";

  const variants = {
    enter: (d: number) => ({ opacity: 0, rotateY: reduce ? 0 : d * 18, x: reduce ? 0 : d * 40 }),
    center: { opacity: 1, rotateY: 0, x: 0 },
    exit: (d: number) => ({ opacity: 0, rotateY: reduce ? 0 : d * -14, x: reduce ? 0 : d * -40 }),
  };

  return (
    <div
      className="page carnet-page dog-ear"
      onTouchStart={(e) => (touch.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const x = e.changedTouches[0]?.clientX;
        if (touch.current !== null && x !== undefined) {
          const dx = x - touch.current;
          if (dx < -50) go(1);
          if (dx > 50) go(-1);
        }
        touch.current = null;
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
      tabIndex={0}
      aria-label="Notebook, turn pages with the arrow keys"
    >
      <Reveal as="header" className="page-head" style={{ alignItems: "baseline" }}>
        <div>
          <p className="eyebrow" style={{ marginBottom: ".4rem" }}>
            notebook · {fiches.length} card{fiches.length === 1 ? "" : "s"}
          </p>
          <p className="hand">{periode || "empty notebook"}</p>
        </div>
        <span className="mono legend">
          page {page + 1} / {pages.length}
        </span>
      </Reveal>
      <hr className="rule" style={{ margin: "0.8rem 0 1.5rem" }} />

      {fiches.length === 0 ? (
        <p className="legend" style={{ maxWidth: "50ch" }}>
          No cards yet. The first one is taken in the street:{" "}
          <Link href="/" className="wobble-underline">
            today&apos;s hunt
          </Link>
          .
        </p>
      ) : (
        <div style={{ perspective: 1400 }}>
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={page}
              className={`spread ${n === 6 ? "spread-double" : ""}`}
              custom={dir}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              style={{ transformOrigin: dir === 1 ? "left center" : "right center" }}
            >
              {current.map((f) => (
                <Link key={f.id} href={`/carnet/${f.id}`} className="spread-item" aria-label={`Open card ${f.id}`}>
                  <Fiche
                    id={f.id}
                    size={n === 6 ? "sm" : undefined}
                    brand={brandName(brands, f.brandId)}
                    image={f.image}
                    date={new Date(f.date)}
                    city={f.city}
                    rarity={f.rarity}
                    stamp={f.paid === false ? { text: "over budget", tone: "red" } : f.inHunt ? { text: "daily hunt", tone: "green" } : { text: "logged", tone: "green" }}
                  />
                </Link>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2rem" }}>
        <button className="btn-quiet" onClick={() => go(-1)} disabled={page === 0} aria-label="Previous page">
          ← previous page
        </button>
        <span className="mono legend">swipe or use the arrows</span>
        <button className="btn-quiet" onClick={() => go(1)} disabled={page >= pages.length - 1} aria-label="Next page">
          next page →
        </button>
      </footer>

      <style jsx global>{`
        .spread {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          align-items: start;
          gap: 1.4rem 1.1rem;
          justify-items: center;
          transform-style: preserve-3d;
        }
        @media (min-width: 640px) {
          .spread {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (min-width: 1240px) {
          .spread-double {
            grid-template-columns: repeat(6, minmax(0, 1fr));
            position: relative;
            padding: 1rem 1.5rem;
          }
          .spread-double::before {
            content: "";
            position: absolute;
            left: 50%;
            top: 0;
            bottom: 0;
            width: 2px;
            background: linear-gradient(90deg, transparent, var(--rule-hair), transparent);
            box-shadow: 0 0 16px var(--rule-hair);
          }
        }
        .spread-item {
          display: block;
          width: 100%;
          max-width: 360px;
        }
      `}</style>
    </div>
  );
}
