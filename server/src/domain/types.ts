import type { Address, Hex } from "viem";

/** Une lecture capteur (accéléromètre + gyroscope) pendant la fenêtre de capture. */
export interface SensorSample {
  t: number; // ms relatif au début de la capture
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
}

/** Ce que la PWA envoie sur POST /prise. Deux images extraites du flux, jamais rephotographiées. */
export interface PriseInput {
  wallet: Address;
  brandId: number;
  frameA: Buffer;
  frameB: Buffer;
  sensors: SensorSample[];
  clientTimestampMs: number;
  deviceFingerprint: string;
  ip: string;
  country: string | null;
  cityCode: number; // code de ville, jamais des coordonnées
  cityLabel: string; // "Lyon, FR"
}

export interface Brand {
  id: number;
  name: string;
  symbol: string | null; // symbole ERC-20 du Stock Token, lu à l'admission
  token: Address;
  priceFeed: Address;
  sector: number;
  active: boolean;
  rarity: number; // coefficient ×1,000 → 1.0
}

export interface Account {
  wallet: Address;
  firstSeen: Date;
  risk: number;
  subscriber: boolean;
  deviceFps: string[];
  lastCountry: string | null;
  lastSeenAt: Date | null;
}

export interface SightingRecord {
  id: number;
  wallet: Address;
  brandId: number;
  createdAt: Date;
  phash: Buffer;
  bgPhash: Buffer | null;
  imageKey: string;
  imageHash: Hex;
  cityCode: number;
  cityLabel: string;
  inHunt: boolean;
  rarityAt: number;
  usdValue: number;
  paid: boolean | null;
  nonce: bigint | null;
  txClaim: Hex | null;
  visionScore: number;
  escalated: boolean;
  riskAt: number;
}

/** Une prise validée, en attente de son voucher (contre-angle) ou déjà munie d'un voucher. */
export interface PendingPrise {
  id: string;
  wallet: Address;
  brandId: number;
  sightingId: number | null;
  imageHash: Hex;
  imageKey: string;
  phash: Buffer;
  cityCode: number;
  usdValue: number;
  tokenAmount: bigint;
  counterAngleDeadlineMs: number | null;
  counterAngleEmbedding: number[] | null;
  counterAnglePhash: Buffer | null;
  createdAt: Date;
  lastNonce: bigint | null;
}

export interface Voucher {
  wallet: Address;
  brandId: number;
  amount: bigint;
  token: Address;
  nonce: bigint;
  issuedAt: bigint;
  deadline: bigint;
  imageHash: Hex;
  cityCode: number;
}

export type RejectMotif =
  | "quota atteint"
  | "métadonnées de fichier détectées"
  | "capteurs immobiles"
  | "capteurs trop réguliers"
  | "images identiques"
  | "horloge incohérente"
  | "la scène semble plane"
  | "motif d'écran détecté"
  | "cadre d'écran détecté"
  | "objet non reconnu"
  | "déjà consignée"
  | "déjà consignée par quelqu'un d'autre"
  | "marque retirée"
  | "contre-angle trop proche"
  | "contre-angle hors délai"
  | "prise introuvable";

export type PriseOutcome =
  | {
      kind: "valide";
      priseId: string;
      voucher: Voucher;
      signature: Hex;
      usdValue: number;
      paid: boolean; // false → budget épuisé ou région sans fragment : fiche seule
      regionRestricted: boolean; // true → pays où les Stock Tokens ne sont pas proposés
      fragmentsPaused: boolean; // true → fragments désactivés côté serveur (FRAGMENTS_ENABLED=false) : fiche seule
      inHunt: boolean;
      rarity: number;
      imageKey: string;
      imageHash: Hex;
    }
  | { kind: "contre-angle"; priseId: string; deadlineMs: number }
  | { kind: "rejet"; motif: RejectMotif; flags: string[] };
