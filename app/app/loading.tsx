import { LoadingFrame } from "@/components/LoadingFrame";

/** Shown at once when a tab is clicked, while the next page is being prepared. */
export default function Loading() {
  return (
    <div className="page" style={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
      <LoadingFrame label="opening" />
    </div>
  );
}
