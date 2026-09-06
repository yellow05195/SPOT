import { demo } from "./demo";

/** Client de l'API du claim server (spec 7.2). En démo (NEXT_PUBLIC_DEMO=1), des données figées. */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
export const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

export interface BrandDto {
  id: number;
  name: string;
  symbol: string | null; // symbole du Stock Token (AMZN), affiché après le fragment
  sector: number;
  rarity: number;
}
export interface ChasseDto {
  day: number;
  brands: BrandDto[];
  budgetUsd: number;
  spentUsd: number;
  sightingsToday: number;
  resetInSeconds: number;
  budgetExhausted: boolean;
  fragmentsEnabled?: boolean; // absent or true: fragments flow. false: cards and plates only, for now
}
export interface FicheDto {
  id: number;
  brandId: number;
  date: string;
  image: string | null;
  imageHash: string;
  city: string;
  inHunt: boolean;
  rarity: number;
  usdValue: number;
  paid: boolean | null;
}
export interface PlateDto {
  id: number;
  name: string;
  brandIds: number[];
  opensAt: number;
  platesSealed: number;
  closed: boolean;
}
export interface VaultDto {
  vault: string | null;
  explorer: string | null;
  day: number;
  budgetUsd: number;
  spentUsd: number;
  status: "STOCKED" | "BUDGET SPENT";
  brands: { brandId: number; name: string; token: string; units: string; usdValue: number | null; explorer: string }[];
}
export interface StatsDto {
  prisesParJour: number[];
  prisesParJoueur7j: number;
  joueursActifs7j: number;
  tauxEscalade: number;
  comptesRisqueEleve: number;
  diversiteGeographique: number;
  budgetDuJour: { budgetUsd: number; spentUsd: number; claims: number; fichesSeules: number; rejets: number } | null;
}

export const SECTEURS: Record<number, string> = { 1: "Logistics", 2: "Beverages", 3: "Mobility", 4: "Screens", 5: "Energy", 6: "Food", 7: "Retail", 8: "Finance", 9: "Fashion", 10: "Home", 11: "Travel", 12: "Industry" };

async function get<T>(path: string, fallback: T): Promise<T> {
  if (DEMO) return fallback;
  try {
    const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export const api = {
  chasse: () => get<ChasseDto>("/chasse", demo.chasse),
  marques: () => get<{ brands: BrandDto[] }>("/marques", { brands: demo.brands }),
  carnet: (wallet: string, page = 0) => get<{ page: number; fiches: FicheDto[] }>(`/carnet/${wallet}?page=${page}`, { page, fiches: DEMO ? demo.fiches : [] }),
  planches: () => get<{ plates: PlateDto[] }>("/planches", { plates: demo.plates }),
  terrain: (q: { marque?: string; secteur?: string; pays?: string }) => {
    const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]);
    return get<{ fiches: FicheDto[] }>(`/terrain?${p}`, { fiches: demo.terrain });
  },
  vault: () => get<VaultDto>("/vault", demo.vault),
  stats: () => get<StatsDto>("/stats", demo.stats),
};

export function brandName(brands: BrandDto[], id: number): string {
  return brands.find((b) => b.id === id)?.name ?? `marque ${id}`;
}
