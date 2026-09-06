import { randomBytes } from "node:crypto";
import { encodeAbiParameters, keccak256, type Hex } from "viem";

/**
 * La chasse du jour (spec 2.3, 6.3) : cinq marques tirées parmi les actives, pondérées à l'inverse
 * de leur fréquence de sélection récente. Commit-reveal : le hash des 30 prochains jours est
 * publié à l'avance, révélé chaque jour. Personne, pas même nous, ne peut modifier la chasse après
 * coup — le contrat refuse un engagement pour le jour même, et n'accepte qu'une préimage exacte.
 */

export const HUNT_SIZE = 5;

export interface HuntSecret {
  day: number;
  brandIds: number[];
  salt: Hex;
  commitment: Hex;
}

/** Encodage identique à `keccak256(abi.encode(uint32 day, uint32[5] ids, bytes32 salt))`. */
export function commitment(day: number, brandIds: number[], salt: Hex): Hex {
  if (brandIds.length !== HUNT_SIZE) throw new Error("une chasse compte exactement 5 marques");
  return keccak256(encodeAbiParameters([{ type: "uint32" }, { type: "uint32[5]" }, { type: "bytes32" }], [day, brandIds as [number, number, number, number, number], salt]));
}

/** Tirage pondéré sans remise : poids = 1 / (1 + sélections récentes). */
export function drawHunt(activeBrandIds: number[], recentSelections: Map<number, number>, rnd: () => number = Math.random): number[] {
  if (activeBrandIds.length < HUNT_SIZE) throw new Error(`il faut au moins ${HUNT_SIZE} marques actives`);
  const pool = activeBrandIds.map((id) => ({ id, w: 1 / (1 + (recentSelections.get(id) ?? 0)) }));
  const out: number[] = [];
  while (out.length < HUNT_SIZE) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let x = rnd() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      x -= (pool[i] as { w: number }).w;
      if (x <= 0) {
        idx = i;
        break;
      }
    }
    out.push((pool[idx] as { id: number }).id);
    pool.splice(idx, 1);
  }
  return out;
}

export function newSalt(): Hex {
  return `0x${randomBytes(32).toString("hex")}` as Hex;
}

/** Prépare `days` chasses à partir de `firstDay`, en tenant compte des sélections déjà planifiées. */
export function planHunts(firstDay: number, days: number, activeBrandIds: number[], recent: Map<number, number>, rnd: () => number = Math.random): HuntSecret[] {
  const counts = new Map(recent);
  const out: HuntSecret[] = [];
  for (let i = 0; i < days; i++) {
    const day = firstDay + i;
    const brandIds = drawHunt(activeBrandIds, counts, rnd);
    for (const id of brandIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    const salt = newSalt();
    out.push({ day, brandIds, salt, commitment: commitment(day, brandIds, salt) });
  }
  return out;
}

export function dayIndex(nowMs: number): number {
  return Math.floor(nowMs / 1000 / 86400);
}
