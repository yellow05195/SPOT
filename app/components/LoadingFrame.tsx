/** Loading: never a spinner. A glass card whose outline traces itself in a loop. */
export function LoadingFrame({ label = "loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" style={{ display: "grid", gap: "0.8rem", justifyItems: "center" }}>
      <div className="glass" style={{ position: "relative", width: 140, height: 175, borderRadius: 22, boxShadow: "var(--shadow-sm)" }}>
        <svg className="loading-frame" width="140" height="175" viewBox="0 0 140 175" aria-hidden="true" style={{ position: "absolute", inset: 0 }}>
          <rect x="1.5" y="1.5" width="137" height="172" rx="20" fill="none" stroke="var(--accent-2)" strokeWidth="2" pathLength={400} />
        </svg>
      </div>
      <span className="mono legend">{label}</span>
    </div>
  );
}
