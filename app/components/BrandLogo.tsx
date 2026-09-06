"use client";

import { useEffect, useRef, useState } from "react";
import { iconSources } from "@/lib/logos";

/**
 * The brand as a profile picture: its own square app icon (the Netflix N, the apple, the swoosh)
 * inside a rounded tile, always `size` × `size`. Wordmarks never overflow because there are none.
 * A source that fails to decode (before or after hydration) falls through to the next one.
 */
export function BrandLogo({ brand, size = 32, className, style }: { brand: string; size?: number; className?: string; style?: React.CSSProperties }) {
  const sources = iconSources(brand);
  const [i, setI] = useState(0);
  const ref = useRef<HTMLImageElement>(null);
  const src = sources[i];
  const radius = Math.round(size * 0.24);
  const next = () => setI((n) => n + 1);
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) next();
  }, [src]);
  return (
    <span className={`brand-pp ${className ?? ""}`} style={{ width: size, height: size, borderRadius: radius, fontSize: Math.max(10, Math.round(size * 0.42)), ...style }} aria-hidden="true">
      {src ? (
        <img ref={ref} key={src} src={src} alt="" width={size} height={size} loading="eager" decoding="async" onError={next} style={{ borderRadius: radius }} />
      ) : (
        <span className="brand-pp-letter">{brand.slice(0, 1)}</span>
      )}
    </span>
  );
}
