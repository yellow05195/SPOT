"use client";

import Link from "next/link";
import { BrandLogo } from "./BrandLogo";

/**
 * The hero: a real street, someone photographing a city centre, slowly drifting behind a dark veil
 * that fades into the page. The statement sits dead centre in balloon lettering, and today's five
 * brands float in a tidy row underneath. Only transform animations, so nothing repaints on scroll.
 */
export function Hero({ brands }: { brands: { id: number; name: string }[]; date?: Date }) {
  return (
    <section className="hero">
      <div className="hero-bg" aria-hidden="true">
        <img src="/hero.jpg" srcSet="/hero-sm.jpg 900w, /hero.jpg 2000w" sizes="100vw" alt="" className="hero-photo" fetchPriority="high" />
        <div className="hero-veil" />
      </div>

      <div className="hero-text reveal">
        <p className="hero-kicker">
          <span className="hero-kicker-dot" aria-hidden="true" />
          today&apos;s hunt is live
        </p>
        <h1 className="hero-title">
          <span className="hero-line hero-line-1">Every street</span>
          <span className="hero-line hero-line-2">owns a piece.</span>
        </h1>
        <p className="hero-lede">Photograph a listed company in the wild: a van, a can, a car at the lights. Keep a card and a real fragment of its stock. Bought in advance. Nothing minted, ever.</p>
        <div className="hero-actions">
          <Link href="#hunt" className="btn">
            Start today&apos;s hunt
          </Link>
          <Link href="/terrain" className="btn btn-secondary">
            See the world map
          </Link>
        </div>

        <div className="hero-brands" aria-label="Today's five brands">
          {brands.slice(0, 5).map((b, i) => (
            <Link key={b.id} href={`/prise/${b.id}`} aria-label={`Log ${b.name}`} className="hero-tile" style={{ animationDelay: `${i * 0.45}s` }}>
              <BrandLogo brand={b.name} size={48} />
            </Link>
          ))}
        </div>
      </div>

      <style jsx global>{`
        .hero {
          position: relative;
          width: 100vw;
          margin: -1.25rem 0 0.5rem calc(50% - 50vw);
          min-height: 100dvh;
          display: grid;
          place-items: center;
          text-align: center;
          padding: 5rem 1rem 4rem;
          overflow: hidden;
        }
        @media (min-width: 640px) {
          .hero {
            margin-top: calc(-78px - 2.6rem);
            margin-bottom: 0.75rem;
          }
        }
        .hero-bg {
          position: absolute;
          inset: 0;
          z-index: 0;
          overflow: hidden;
        }
        .hero-photo {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: 50% 62%;
        }
        .hero-veil {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(60% 50% at 50% 50%, rgba(10, 10, 11, 0.15), rgba(10, 10, 11, 0.55) 100%),
            linear-gradient(180deg, rgba(10, 10, 11, 0.7) 0%, rgba(10, 10, 11, 0.35) 40%, rgba(10, 10, 11, 0.55) 75%, var(--bg) 100%);
        }
        .hero-text {
          max-width: 980px;
          display: grid;
          gap: 1.5rem;
          justify-items: center;
          position: relative;
          z-index: 2;
        }
        .hero-kicker {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          font-family: var(--font-display);
          font-size: 0.74rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #fff;
          background: rgba(18, 18, 20, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 999px;
          padding: 0.45rem 0.9rem 0.45rem 0.7rem;
        }
        .hero-kicker-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 0 0 3px rgba(255, 243, 18, 0.25);
        }
        .hero-title {
          font-family: var(--font-balloon), var(--font-display);
          font-weight: 400;
          font-size: clamp(3.4rem, 10.5vw, 8.6rem);
          line-height: 0.92;
          letter-spacing: 0.01em;
          display: grid;
          gap: 0.05em;
        }
        .hero-line {
          display: block;
        }
        .hero-line-1 {
          color: #ffffff;
          text-shadow:
            0 4px 0 #8e8e9a,
            0 12px 28px rgba(0, 0, 0, 0.55);
        }
        .hero-line-2 {
          color: #fff312;
          text-shadow:
            0 4px 0 #9a8b00,
            0 12px 28px rgba(0, 0, 0, 0.55);
        }
        .hero-lede {
          margin: 0 auto;
          text-align: center;
          max-width: 52ch;
          font-size: 1.1rem;
          line-height: 1.55;
          color: rgba(255, 255, 255, 0.86);
          text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
        }
        .hero-actions {
          display: flex;
          gap: 0.7rem;
          flex-wrap: wrap;
          justify-content: center;
        }
        .hero-brands {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.8rem;
          margin-top: 1.2rem;
        }
        .hero-tile {
          display: grid;
          place-items: center;
          width: 112px;
          height: 84px;
          border-radius: 16px;
          background: rgba(18, 18, 20, 0.78);
          border: 1px solid rgba(255, 255, 255, 0.12);
          animation: hero-float 6s ease-in-out infinite;
          transition:
            transform 220ms var(--ease-set),
            border-color 220ms;
        }
        .hero-tile:hover {
          border-color: rgba(255, 243, 18, 0.6);
          animation-play-state: paused;
          transform: translateY(-6px) scale(1.04);
        }
        @keyframes hero-float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-8px);
          }
        }
        @media (max-width: 639px) {
          .hero-tile {
            width: 92px;
            height: 70px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-tile {
            animation: none;
          }
        }
      `}</style>
    </section>
  );
}
