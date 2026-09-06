/** Statuses are pill badges: green for good news, red for a refusal. */
export function Tampon({ text, tone = "red", drop = false, across = false, style }: { text: string; tone?: "red" | "green"; drop?: boolean; across?: boolean; style?: React.CSSProperties }) {
  return (
    <span className={`stamp ${tone === "green" ? "stamp-green" : ""} ${drop ? "stamp-drop" : ""} ${across ? "stamp-across" : ""}`} style={style} role="status">
      {tone === "green" ? "✓ " : ""}
      {text}
    </span>
  );
}

/** The day, as a small glass chip. */
export function TamponDateur({ date, className }: { date: Date; className?: string }) {
  const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
  const d = `${String(date.getDate()).padStart(2, "0")}.${roman[date.getMonth()]}.${String(date.getFullYear()).slice(-2)}`;
  const h = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return (
    <span className={`glass ${className ?? ""}`} aria-hidden="true" style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2, borderRadius: 16, padding: "0.6rem 0.9rem", boxShadow: "var(--shadow-sm)", fontFamily: "var(--font-mono)", fontSize: ".72rem", color: "var(--muted)" }}>
      <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.1rem", color: "var(--text)", letterSpacing: "-0.02em" }}>{h}</span>
      <span>{d}</span>
    </span>
  );
}
