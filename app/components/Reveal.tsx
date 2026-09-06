"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Entrance motion that never hides content: everything is visible immediately and settles into
 * place with a CSS animation (runs on the compositor, unaffected by background tabs or slow
 * hydration). Only hover/press effects use motion.
 *   <Reveal>   settles a block on mount
 *   <Stagger>  settles its children one after another
 *   <Lift>     a card that lifts under the cursor and presses under the finger
 */
export function Reveal({ children, delay = 0, className, style, as = "div" }: { children: React.ReactNode; delay?: number; className?: string; style?: React.CSSProperties; as?: "div" | "section" | "header" | "footer" | "p" }) {
  const Tag = as;
  return (
    <Tag className={`reveal ${className ?? ""}`} style={{ ...style, animationDelay: `${delay}s` }}>
      {children}
    </Tag>
  );
}

export function Stagger({ children, className, style, gap = 0.06, delay = 0.05 }: { children: React.ReactNode; className?: string; style?: React.CSSProperties; gap?: number; delay?: number }) {
  return (
    <div className={`stagger ${className ?? ""}`} style={{ ...style, ["--stagger-gap" as string]: `${gap}s`, ["--stagger-delay" as string]: `${delay}s` }}>
      {children}
    </div>
  );
}

export function Item({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

export function Lift({ children, className, style, rotate = 0 }: { children: React.ReactNode; className?: string; style?: React.CSSProperties; rotate?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      style={{ ...style, rotate }}
      whileHover={reduce ? undefined : { y: -4, rotate: 0, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } }}
      whileTap={reduce ? undefined : { y: 1, transition: { duration: 0.12 } }}
    >
      {children}
    </motion.div>
  );
}
