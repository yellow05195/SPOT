import { KMSClient, GetPublicKeyCommand, SignCommand } from "@aws-sdk/client-kms";
import { type Address, type Hex, keccak256, recoverAddress, toHex, hexToBytes, type TypedDataDomain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Voucher } from "../domain/types.js";
import { VOUCHER_TYPES, voucherDigest, voucherMessage, type VoucherSigner } from "./sign.js";

/** Dev / test uniquement : clé en mémoire. Refusée en production par `loadConfig`. */
export class LocalDevSigner implements VoucherSigner {
  private readonly account;
  readonly address: Address;
  constructor(privateKey: Hex) {
    this.account = privateKeyToAccount(privateKey);
    this.address = this.account.address;
  }
  signVoucher(domain: TypedDataDomain, v: Voucher): Promise<Hex> {
    return this.account.signTypedData({ domain, types: VOUCHER_TYPES, primaryType: "Voucher", message: voucherMessage(v) });
  }
}

/**
 * Production : la clé ne quitte jamais AWS KMS (ECC_SECG_P256K1, usage SIGN_VERIFY).
 * On signe le digest EIP-712, on décode la signature DER, on normalise `s` (low-s) et on retrouve `v`.
 */
export class KmsSigner implements VoucherSigner {
  private constructor(
    private readonly client: KMSClient,
    private readonly keyId: string,
    readonly address: Address,
  ) {}

  static async create(keyId: string, region?: string): Promise<KmsSigner> {
    const client = new KMSClient(region ? { region } : {});
    const pub = await client.send(new GetPublicKeyCommand({ KeyId: keyId }));
    if (!pub.PublicKey) throw new Error("KMS : clé publique absente");
    const address = addressFromSpki(new Uint8Array(pub.PublicKey));
    return new KmsSigner(client, keyId, address);
  }

  async signVoucher(domain: TypedDataDomain, v: Voucher): Promise<Hex> {
    const digest = voucherDigest(domain, v);
    const res = await this.client.send(
      new SignCommand({ KeyId: this.keyId, Message: hexToBytes(digest), MessageType: "DIGEST", SigningAlgorithm: "ECDSA_SHA_256" }),
    );
    if (!res.Signature) throw new Error("KMS : signature absente");
    const { r, s } = decodeDer(new Uint8Array(res.Signature));
    const sig = await toEthSignature(digest, r, s, this.address);
    return sig;
  }
}

const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

export function decodeDer(der: Uint8Array): { r: bigint; s: bigint } {
  if (der[0] !== 0x30) throw new Error("DER invalide");
  let i = 2;
  if (der[i] !== 0x02) throw new Error("DER invalide (r)");
  const rLen = der[i + 1] as number;
  const r = bytesToBigint(der.subarray(i + 2, i + 2 + rLen));
  i += 2 + rLen;
  if (der[i] !== 0x02) throw new Error("DER invalide (s)");
  const sLen = der[i + 1] as number;
  const s = bytesToBigint(der.subarray(i + 2, i + 2 + sLen));
  return { r, s };
}

function bytesToBigint(b: Uint8Array): bigint {
  let x = 0n;
  for (const byte of b) x = (x << 8n) | BigInt(byte);
  return x;
}

function pad32(x: bigint): Hex {
  return `0x${x.toString(16).padStart(64, "0")}` as Hex;
}

/** Normalise s (low-s) et trouve le v ∈ {27, 28} qui retrouve l'adresse attendue. */
export async function toEthSignature(digest: Hex, r: bigint, s: bigint, expected: Address): Promise<Hex> {
  if (s > SECP256K1_N / 2n) s = SECP256K1_N - s;
  for (const v of [27n, 28n]) {
    const sig = `${pad32(r)}${pad32(s).slice(2)}${v.toString(16)}` as Hex;
    const rec = await recoverAddress({ hash: digest, signature: sig });
    if (rec.toLowerCase() === expected.toLowerCase()) return sig;
  }
  throw new Error("KMS : impossible de retrouver l'adresse depuis la signature");
}

/** SPKI DER → point non compressé (65 octets, préfixe 0x04) → adresse. */
export function addressFromSpki(spki: Uint8Array): Address {
  const idx = spki.findIndex((b, i) => b === 0x04 && spki.length - i === 65);
  if (idx < 0) throw new Error("SPKI : point non compressé introuvable");
  const point = spki.subarray(idx + 1);
  const hash = keccak256(toHex(point));
  return `0x${hash.slice(-40)}` as Address;
}
