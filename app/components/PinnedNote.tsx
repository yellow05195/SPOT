/** A static pinned note, for the states that must not be rushed. */
export function PinnedNote({ children, tone = "ink", style }: { children: React.ReactNode; tone?: "ink" | "red" | "green"; style?: React.CSSProperties }) {
  const color = tone === "green" ? "var(--stamp-green)" : tone === "red" ? "var(--stamp-red)" : "var(--ink-blue)";
  return (
    <div className="pinned" style={{ maxWidth: 440, ...style }} role="note">
      <span className="pin" style={{ left: 8, top: 8, background: color }} />
      <p className="hand" style={{ fontSize: "1.3rem", color }}>
        {children}
      </p>
    </div>
  );
}
