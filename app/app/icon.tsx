import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** The app icon: the SPOT mark (a map pin whose head is a camera shutter) on near-black. */
export default async function Icon() {
  const svg = await readFile(join(process.cwd(), "public", "logo-square.svg"), "utf8");
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  return new ImageResponse(
    <div style={{ width: 512, height: 512, background: "#0a0a0b", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={512} height={512} style={{ width: 512, height: 512 }} />
    </div>,
    size,
  );
}
