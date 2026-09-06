import type { Address } from "viem";

export const VAULT_ADDRESS = (process.env.NEXT_PUBLIC_VAULT_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address;
export const SIGHTINGS_ADDRESS = (process.env.NEXT_PUBLIC_SIGHTINGS_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address;
export const PLATES_ADDRESS = (process.env.NEXT_PUBLIC_PLATES_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address;

/** Le voucher tel que le signe le serveur et le vérifie SpotVault (neuf champs). */
export const vaultAbi = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "v",
        type: "tuple",
        components: [
          { name: "wallet", type: "address" },
          { name: "brandId", type: "uint32" },
          { name: "amount", type: "uint128" },
          { name: "token", type: "address" },
          { name: "nonce", type: "uint64" },
          { name: "issuedAt", type: "uint64" },
          { name: "deadline", type: "uint64" },
          { name: "imageHash", type: "bytes32" },
          { name: "cityCode", type: "uint32" },
        ],
      },
      { name: "sig", type: "bytes" },
    ],
    outputs: [{ name: "paid", type: "bool" }],
  },
  { type: "function", name: "budgetState", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }, { type: "uint256" }, { type: "uint256" }] },
  { type: "function", name: "used", stateMutability: "view", inputs: [{ type: "uint64" }], outputs: [{ type: "bool" }] },
] as const;

export const platesAbi = [
  { type: "function", name: "seal", stateMutability: "nonpayable", inputs: [{ name: "plateId", type: "uint32" }, { name: "sightingIds", type: "uint256[7]" }], outputs: [{ type: "uint256" }] },
] as const;

export const sightingsAbi = [
  { type: "function", name: "sightingId", stateMutability: "pure", inputs: [{ type: "address" }, { type: "uint32" }, { type: "uint32" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;
