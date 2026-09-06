"use client";

import { BrandLogo } from "./BrandLogo";
import { dateRoman, heure, coeff } from "@/lib/format";

export interface TickerItem {
  id: number;
  brand: string;
  city: string;
  date: string;
  rarity: number;
}

/** A live strip of the latest cards from around the world, sliding slowly like a ticker tape (CSS-driven). */
export function Ticker({ items, countries, today }: { items: TickerItem[]; countries: number; today: number }) {
  const row = [...items, ...items];
  return (
    <div className="ticker" aria-label="Latest cards from the field">
      <div className="ticker-head">
        <span className="ticker-dot" aria-hidden="true" />
        <span className="eyebrow" style={{ color: "var(--text)" }}>
          live · {countries} countries · {today} cards today
        </span>
      </div>
      <div className="ticker-viewport">
        <div className="ticker-row" style={{ animationDuration: `${Math.max(36, items.length * 5)}s` }}>
          {row.map((it, i) => (
            <span key={`${it.id}-${i}`} className="ticker-item">
              <BrandLogo brand={it.brand} size={28} />
              <span className="ticker-brand">{it.brand}</span>
              <span className="mono legend">
                {it.city} · {dateRoman(new Date(it.date))} {heure(new Date(it.date))} · {coeff(it.rarity)}
              </span>
            </span>
          ))}
        </div>
      </div>
      <style jsx global>{`
        .ticker {
          border-radius: 999px;
          box-shadow: none;
          display: grid;
          grid-template-columns: auto 1fr;
          align-items: center;
          overflow: hidden;
        }
        .ticker-head {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.7rem 1.1rem;
          white-space: nowrap;
          background: var(--surface-strong);
          border-radius: 999px;
          margin: 4px;
          z-index: 1;
        }
        .ticker-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
        }
        .ticker-viewport {
          overflow: hidden;
        }
        .ticker-row {
          display: flex;
          gap: 2.4rem;
          width: max-content;
          padding: 0.45rem 1rem;
          animation: ticker-scroll 40s linear infinite;
        }
        @keyframes ticker-scroll {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
        .ticker:hover .ticker-row {
          animation-play-state: paused;
        }
        .ticker-item {
          display: inline-flex;
          align-items: center;
          gap: 0.6rem;
          white-space: nowrap;
        }
        .ticker-brand {
          font-family: var(--font-display);
          font-weight: 700;
          color: var(--text);
          font-size: 0.92rem;
        }
        @media (prefers-reduced-motion: reduce) {
          .ticker-row {
            animation: none;
          }
        }
        @media (max-width: 639px) {
          .ticker {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
