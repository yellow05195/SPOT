"use client";

import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from "motion/react";

/** A card that tilts in 3D under the cursor: like a collectible held up to the light. Settles, never bounces. */
export function Tilt({ children, className, style, max = 9 }: { children: React.ReactNode; className?: string; style?: React.CSSProperties; max?: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rx = useSpring(useTransform(py, [0, 1], [max, -max]), { stiffness: 220, damping: 30, mass: 0.6 });
  const ry = useSpring(useTransform(px, [0, 1], [-max, max]), { stiffness: 220, damping: 30, mass: 0.6 });
  const glare = useTransform([px, py], ([x, y]) => `radial-gradient(circle at ${(x as number) * 100}% ${(y as number) * 100}%, rgba(255,255,255,0.16), transparent 55%)`);
  if (reduce) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }
  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ ...style, rotateX: rx, rotateY: ry, transformStyle: "preserve-3d", perspective: 900, position: "relative" }}
      onPointerMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        px.set((e.clientX - r.left) / r.width);
        py.set((e.clientY - r.top) / r.height);
      }}
      onPointerLeave={() => {
        px.set(0.5);
        py.set(0.5);
      }}
    >
      {children}
      <motion.span aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", background: glare, mixBlendMode: "soft-light" }} />
    </motion.div>
  );
}
