/** A brand name, set in the display face. Accessible name provided for screen readers. */
export function Manuscrit({ text, strong = false, animate = false, pencil = false, size }: { text: string; strong?: boolean; animate?: boolean; pencil?: boolean; size?: number }) {
  return (
    <span className="manuscrit" aria-label={text} role="text" style={{ display: "inline-block", maxWidth: "100%" }}>
      <span
        className={`hand hand-name ${animate ? "hand-write" : ""}`}
        aria-hidden="true"
        style={{
          ...(size ? { fontSize: `${size * 0.85}rem` } : {}),
          color: pencil ? "var(--muted)" : strong ? "var(--gold)" : "var(--text)",
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </span>
    </span>
  );
}
