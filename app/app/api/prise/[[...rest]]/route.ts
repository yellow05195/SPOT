import { NextRequest } from "next/server";

/**
 * The lens talks to the claim server through the site, not directly: the site's edge knows the
 * player's country, city and IP (Vercel headers) and hands them to the server in the headers it
 * trusts (Cloudflare names). Without this, a server that is not behind Cloudflare would see every
 * player as the same unknown place and the map would stay empty.
 */
export const runtime = "nodejs";
export const maxDuration = 120; // the server can take a while on a cold start
export const dynamic = "force-dynamic";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest, ctx: { params: Promise<{ rest?: string[] }> }) {
  const { rest = [] } = await ctx.params;
  const path = ["prise", ...rest].map(encodeURIComponent).join("/");
  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const country = req.headers.get("cf-ipcountry") ?? req.headers.get("x-vercel-ip-country");
  const city = req.headers.get("cf-ipcity") ?? req.headers.get("x-vercel-ip-city");
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (country) headers.set("cf-ipcountry", country);
  if (city) headers.set("cf-ipcity", decodeURIComponent(city));
  if (ip) headers.set("cf-connecting-ip", ip);
  const body = await req.arrayBuffer();
  const res = await fetch(`${API_URL}/${path}`, { method: "POST", headers, body, cache: "no-store" });
  const out = new Headers();
  const type = res.headers.get("content-type");
  if (type) out.set("content-type", type);
  return new Response(await res.arrayBuffer(), { status: res.status, headers: out });
}
