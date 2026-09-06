import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "SPOT. Photograph a brand in the street. Get the card, get a piece of the stock.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The link preview: near-black, the pin on the left, the word SPOT big in yellow, the one-line pitch
 * under it. The pin is read from public/logo.svg and inlined, so no remote fetch at render time.
 */
export default async function OpenGraphImage() {
  const svg = await readFile(join(process.cwd(), "public", "logo.svg"), "utf8").catch(() => null);
  const pin = svg ? `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` : null;
  return new ImageResponse(
    <div style={{ width: 1200, height: 630, background: "#0a0a0b", display: "flex", alignItems: "center", padding: "0 96px", fontFamily: "sans-serif" }}>
      {pin && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pin} alt="" width={225} height={320} style={{ width: 225, height: 320, marginRight: 72 }} />
      )}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontSize: 220, fontWeight: 700, letterSpacing: -8, lineHeight: 1, color: "#fff312" }}>SPOT</div>
        <div style={{ marginTop: 28, fontSize: 36, lineHeight: 1.3, color: "#ffffff", maxWidth: 720 }}>Photograph a brand in the street. Get the card, get a piece of the stock.</div>
      </div>
    </div>,
    size,
  );
}
