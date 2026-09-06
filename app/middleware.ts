import { NextResponse, type NextRequest } from "next/server";

/**
 * Everyone plays everywhere. The edge only tells the app which kind of region it serves, so the
 * lens can say up front whether a fragment can follow the card. The claim server enforces the
 * real rule on its own (server/src/claim/region.ts): no Stock Token fragment where Robinhood
 * does not offer them, only the card and the pin on the map.
 */
const NO_FRAGMENT = new Set(["US", "CA", "GB", "CH", "CU", "IR", "KP", "SY", "RU", "BY", "VE", "MM"]);

export function middleware(req: NextRequest) {
  const header = req.headers.get("cf-ipcountry") ?? req.headers.get("x-vercel-ip-country");
  const dev = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEMO === "1";
  const country = (header ?? (dev ? process.env.NEXT_PUBLIC_GEO_DEV_COUNTRY : null) ?? "XX").toUpperCase();
  const region = country === "XX" || NO_FRAGMENT.has(country) ? "card-only" : "open";
  const res = NextResponse.next();
  if (req.cookies.get("spot-region")?.value !== region) {
    res.cookies.set("spot-region", region, { path: "/", sameSite: "lax", maxAge: 6 * 3600 });
  }
  return res;
}

export const config = { matcher: ["/((?!_next|sw.js|manifest.webmanifest|icon|logos|maplibre|api/og).*)"] };
