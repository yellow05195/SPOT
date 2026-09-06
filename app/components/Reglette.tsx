/** A progress pill with a soft green fill. */
export function Reglette({ total, value }: { total: number; value: number }) {
  const pct = `${(value / total) * 100}%`;
  return (
    <div className="ruler" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={value} aria-label={`${value} of ${total}`} style={{ ["--progress" as string]: pct }}>
      <span className="ruler-cursor" />
    </div>
  );
}
