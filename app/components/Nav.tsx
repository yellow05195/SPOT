"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Wallet } from "./Wallet";

const ITEMS: [string, string][] = [
  ["/", "Hunt"],
  ["/carnet", "Notebook"],
  ["/planches", "Plates"],
  ["/terrain", "Field"],
  ["/vault", "Vault"],
];

const activeFor = (path: string | null) => ITEMS.find(([href]) => (href === "/" ? path === "/" : path?.startsWith(href)))?.[0] ?? null;

/** A small pulse inside a tab while its page is loading, so a click always answers at once. */
function Pending() {
  const { pending } = useLinkStatus();
  return <span className={`nav-pending ${pending ? "nav-pending-on" : ""}`} aria-hidden="true" />;
}

/** The bar: a floating frosted pill, top on desktop, bottom on mobile. The active pill moves on click, before the page arrives. */
export function Nav() {
  const path = usePathname();
  const [active, setActive] = useState<string | null>(() => activeFor(path));
  useEffect(() => setActive(activeFor(path)), [path]);
  // The out-of-area page hides the bar with CSS (body:has([data-hors-zone])), never by path: a rewrite keeps the URL, and the server and client must agree.
  if (path?.startsWith("/prise/")) return null;
  return (
    <nav className="nav" aria-label="Main">
      <div className="nav-inner">
        <Link href="/" className="nav-brand" aria-label="SPOT, home" onClick={() => setActive("/")}>
          <img src="/logo.svg" alt="" className="nav-logo" width="18" height="26" />
          <span className="nav-mark">SPOT</span>
        </Link>
        <ul className="nav-tabs">
          {ITEMS.map(([href, label]) => {
            const isActive = active === href;
            return (
              <li key={href} style={{ position: "relative" }}>
                {isActive && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }} />}
                <Link href={href} className={`nav-tab ${isActive ? "nav-tab-active" : ""}`} aria-current={activeFor(path) === href ? "page" : undefined} onClick={() => setActive(href)}>
                  {label}
                  <Pending />
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="nav-wallet">
          <Wallet compact />
        </div>
      </div>
      <style jsx global>{`
        .nav {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 30;
          padding: 0 0.75rem calc(0.75rem + env(safe-area-inset-bottom));
          pointer-events: none;
        }
        .nav-inner {
          pointer-events: auto;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          max-width: 1120px;
          margin: 0 auto;
          padding: 0.4rem 0.4rem 0.4rem 1.1rem;
          border-radius: 999px;
          background: var(--pill-bg);
          color: var(--pill-text);
          border: 1px solid var(--pill-border);
          box-shadow: var(--shadow);
        }
        .nav-brand {
          color: var(--pill-text);
          display: none;
          align-items: center;
          gap: 0.55rem;
          padding-right: 0.9rem;
          margin-right: 0.3rem;
          border-right: 1px solid var(--rule-hair);
        }
        .nav-logo {
          height: 26px;
          width: auto;
          display: block;
        }
        .nav-mark {
          font-family: var(--font-display);
          font-weight: 800;
          letter-spacing: 0.06em;
          font-size: 1rem;
        }
        .nav-tabs {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex: 1;
          justify-content: space-around;
          gap: 0.1rem;
        }
        .nav-tab {
          position: relative;
          z-index: 1;
          font-family: var(--font-display);
          font-weight: 600;
          font-size: 0.9rem;
          color: var(--pill-muted);
          padding: 0.55rem 0.95rem;
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          border-radius: 999px;
          transition: color 160ms var(--ease-press);
        }
        .nav-tab:hover {
          color: var(--pill-text);
        }
        .nav-tab-active {
          color: var(--pill-active-text);
        }
        .nav-pill {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          background: var(--pill-active);
        }
        .nav-pending {
          width: 0;
          height: 6px;
          border-radius: 50%;
          background: var(--accent);
          opacity: 0;
          transition:
            width 160ms,
            opacity 160ms;
        }
        .nav-pending-on {
          width: 6px;
          opacity: 1;
          animation: nav-pulse 900ms ease-in-out infinite;
        }
        @keyframes nav-pulse {
          0%,
          100% {
            transform: scale(0.7);
          }
          50% {
            transform: scale(1.2);
          }
        }
        .nav-wallet {
          display: none;
        }
        .nav-wallet .btn-quiet {
          white-space: nowrap;
          background: transparent;
          color: var(--pill-text);
          padding: 0.5rem 0.95rem;
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 999px;
          font-size: 0.86rem;
          font-weight: 600;
          transition:
            border-color 160ms,
            background 160ms;
        }
        .nav-wallet .btn-quiet::after {
          display: none;
        }
        .nav-wallet .btn-quiet:hover {
          color: var(--pill-text);
          border-color: rgba(255, 255, 255, 0.4);
          background: rgba(255, 255, 255, 0.06);
          filter: none;
          transform: none;
        }
        .nav-wallet .btn {
          white-space: nowrap;
          padding: 0.6rem 1.05rem;
          font-size: 0.88rem;
          box-shadow: none;
        }
        .nav-wallet .hand {
          color: var(--pill-text);
          padding-right: 0.6rem;
        }
        @media (max-width: 639px) {
          .nav-inner {
            padding: 0.3rem 0.35rem;
            gap: 0;
          }
          .nav-tab {
            padding: 0.55rem 0.6rem;
            font-size: 0.8rem;
          }
        }
        @media (min-width: 640px) {
          .nav {
            top: 0.9rem;
            bottom: auto;
            padding: 0 1rem;
          }
          .nav-brand,
          .nav-wallet {
            display: flex;
          }
          .nav-tabs {
            justify-content: center;
            gap: 0.15rem;
          }
          main {
            padding-top: 78px;
          }
        }
      `}</style>
    </nav>
  );
}
