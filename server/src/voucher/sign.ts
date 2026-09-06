import { type Address, type Hex, hashTypedData, recoverTypedDataAddress, type TypedDataDomain } from "viem";
import type { Voucher } from "../domain/types.js";

/**
 * Le voucher (spec 4.8), signé EIP-712. Domaine {name: "SPOT", version: "1", chainId, verifyingContract}
 * — un voucher n'est donc jamais portable vers un autre contrat ni une autre chaîne.
 * Les neuf champs et leur ordre sont ceux de `SpotVault.VOUCHER_TYPEHASH` ; le vecteur partagé
 * `test/vectors.test.ts` vérifie qu'ils produisent exactement le même hachage que le contrat.
 */

export const VOUCHER_TYPES = {
  Voucher: [
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
} as const;

export function spotDomain(chainId: number, vault: Address): TypedDataDomain {
  return { name: "SPOT", version: "1", chainId, verifyingContract: vault };
}

export function voucherMessage(v: Voucher) {
  return {
    wallet: v.wallet,
    brandId: v.brandId,
    amount: v.amount,
    token: v.token,
    nonce: v.nonce,
    issuedAt: v.issuedAt,
    deadline: v.deadline,
    imageHash: v.imageHash,
    cityCode: v.cityCode,
  };
}

export function voucherDigest(domain: TypedDataDomain, v: Voucher): Hex {
  return hashTypedData({ domain, types: VOUCHER_TYPES, primaryType: "Voucher", message: voucherMessage(v) });
}

export interface VoucherSigner {
  readonly address: Address;
  signVoucher(domain: TypedDataDomain, v: Voucher): Promise<Hex>;
}

export async function verifyVoucher(domain: TypedDataDomain, v: Voucher, signature: Hex, expected: Address): Promise<boolean> {
  const recovered = await recoverTypedDataAddress({ domain, types: VOUCHER_TYPES, primaryType: "Voucher", message: voucherMessage(v), signature });
  return recovered.toLowerCase() === expected.toLowerCase();
}

/**
 * Nonce unique, anti-rejeu, sur 64 bits : secondes << 20 | compteur. Le compteur repart à chaque
 * seconde ; deux serveurs concurrents doivent se partager un espace via Redis (`nonce:<sec>`).
 */
export class NonceSource {
  private lastSec = 0;
  private counter = 0;
  constructor(
    private readonly nextCounter: (sec: number) => Promise<number> = async (sec) => {
      if (sec !== this.lastSec) {
        this.lastSec = sec;
        this.counter = 0;
      }
      return this.counter++;
    },
  ) {}
  async next(nowMs: number): Promise<bigint> {
    const sec = Math.floor(nowMs / 1000);
    const c = await this.nextCounter(sec);
    if (c >= 1 << 20) throw new Error("trop de nonces dans la même seconde");
    return (BigInt(sec) << 20n) | BigInt(c);
  }
}
