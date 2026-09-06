import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://spot.example";

/** The public pages. The notebook and the shot screens are per wallet, they stay out. */
const PAGES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/terrain", priority: 0.8, changeFrequency: "hourly" },
  { path: "/marques", priority: 0.7, changeFrequency: "weekly" },
  { path: "/planches", priority: 0.7, changeFrequency: "weekly" },
  { path: "/vault", priority: 0.6, changeFrequency: "daily" },
  { path: "/carnet", priority: 0.5, changeFrequency: "daily" },
  { path: "/legal", priority: 0.3, changeFrequency: "monthly" },
  { path: "/vie-privee", priority: 0.3, changeFrequency: "monthly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PAGES.map((p) => ({ url: `${SITE_URL}${p.path}`, lastModified, changeFrequency: p.changeFrequency, priority: p.priority }));
}
