import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

/**
 * L'image de partage (spec 8.5) : générée côté serveur avec Satori pour que le lien partagé rende la
 * même image. Ta photo, le nom manuscrit, la date, la ville, le coefficient. Jamais un logo.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = req.nextUrl.searchParams;
  const marque = q.get("marque") ?? "";
  const ville = q.get("ville") ?? "";
  const dateIso = q.get("date");
  const coeff = Number(q.get("coeff") ?? 1);
  const img = q.get("img") ?? "";
  const d = dateIso ? new Date(dateIso) : new Date();
  const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
  const date = `${String(d.getDate()).padStart(2, "0")}.${roman[d.getMonth()]}.${String(d.getFullYear()).slice(-2)} · ${String(d.getHours()).padStart(2, "0")}h${String(d.getMinutes()).padStart(2, "0")}`;

  const caveat = await fetch("https://fonts.gstatic.com/s/caveat/v18/WnznHAc5bAfYB2QRah7pcpNvOx-pjfJ9SIKjYBxPigs.ttf").then((r) => r.arrayBuffer()).catch(() => null);

  return new ImageResponse(
    <div style={{ width: 900, height: 1200, background: "#F2EDE1", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", fontFamily: "Georgia" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(31,58,95,.10) 1px, transparent 1px), linear-gradient(90deg, rgba(31,58,95,.10) 1px, transparent 1px)", backgroundSize: "19px 19px" }} />
      <div style={{ width: 660, height: 880, background: "#FBF8F0", border: coeff > 4 ? "1px solid #A8863A" : "1px solid #232019", boxShadow: "6px 6px 0 rgba(35,32,25,.2)", display: "flex", flexDirection: "column", padding: "28px 32px 24px", position: "relative" }}>
        <div style={{ width: 596, height: 484, position: "relative", display: "flex", background: "#DCD3BE" }}>
          {img ? <img src={img} width={596} height={484} style={{ objectFit: "cover" }} alt="" /> : null}
          {[
            { left: -2, top: -2, clip: "polygon(0 0, 100% 0, 0 100%)" },
            { right: -2, top: -2, clip: "polygon(0 0, 100% 0, 100% 100%)" },
            { right: -2, bottom: -2, clip: "polygon(100% 0, 100% 100%, 0 100%)" },
            { left: -2, bottom: -2, clip: "polygon(0 0, 100% 100%, 0 100%)" },
          ].map((c, i) => (
            <div key={i} style={{ position: "absolute", width: 36, height: 36, background: "#DCD3BE", clipPath: c.clip, ...(c.left !== undefined ? { left: c.left } : { right: c.right }), ...(c.top !== undefined ? { top: c.top } : { bottom: c.bottom }) }} />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 26, transform: "rotate(-1.2deg)" }}>
          <div style={{ fontFamily: caveat ? "Caveat" : "Georgia", fontSize: 64, color: "#1F3A5F", lineHeight: 1 }}>{marque}</div>
          <div style={{ width: Math.min(560, marque.length * 30), height: 3, background: "#1F3A5F", marginTop: 4, opacity: 0.85 }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 24, fontFamily: "monospace", fontSize: 22, color: "#857C68", gap: 8 }}>
          <div>{`${date} · ${ville}`}</div>
          <div style={{ color: "#232019" }}>{`×${coeff.toFixed(2)}`}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "auto", fontFamily: "monospace", fontSize: 20, color: "#857C68" }}>
          <div>{`No. ${String(id).padStart(6, "0")}`}</div>
          <div style={{ border: "2px solid #3D6B4A", color: "#3D6B4A", padding: "6px 14px", fontSize: 18, letterSpacing: 4, transform: "rotate(-7deg)", opacity: 0.8, fontFamily: "Georgia" }}>LOGGED</div>
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 28, fontFamily: "Georgia", fontSize: 18, letterSpacing: 6, color: "#4E4739" }}>SPOT · FIELD NOTEBOOK</div>
    </div>,
    { width: 900, height: 1200, fonts: caveat ? [{ name: "Caveat", data: caveat, style: "normal", weight: 500 }] : [] },
  );
}
