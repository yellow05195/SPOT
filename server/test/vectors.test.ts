import { describe, it, expect } from "vitest";
import { hashStruct, keccak256, encodeAbiParameters, toHex } from "viem";
import { VOUCHER_TYPES, voucherMessage, spotDomain, verifyVoucher, voucherDigest, NonceSource } from "../src/voucher/sign.js";
import { LocalDevSigner, decodeDer, toEthSignature, addressFromSpki } from "../src/voucher/signer.js";
import { privateKeyToAccount } from "viem/accounts";
import type { Voucher } from "../src/domain/types.js";

/** Vecteurs figés par `contracts/test/Vectors.t.sol` : les deux côtés doivent produire les mêmes octets. */
const VOUCHER_TYPEHASH = "0x8fbc08319303f44edd6c6a22267227632642ac84bb995777bf479757782984a2";
const STRUCT_HASH = "0xac4bde1c5f14dddec23e1ff2edfba68251191759f1472e06e62404b83010fe0e";
const HUNT_COMMITMENT = "0x643792a6c0fb080dd971cc7d5567b3a7e18542eb448746782febf406ba3e4a2e";

const vector: Voucher = {
  wallet: "0x1111111111111111111111111111111111111111",
  brandId: 7,
  amount: 2_100_000_000_000_000n,
  token: "0x2222222222222222222222222222222222222222",
  nonce: 123_456_789n,
  issuedAt: 1_788_625_306n,
  deadline: 1_788_627_106n,
  imageHash: "0x3333333333333333333333333333333333333333333333333333333333333333",
  cityCode: 69_000,
};

describe("vecteurs partagés avec les contrats", () => {
  it("typehash du voucher", () => {
    const encoded = "Voucher(address wallet,uint32 brandId,uint128 amount,address token,uint64 nonce,uint64 issuedAt,uint64 deadline,bytes32 imageHash,uint32 cityCode)";
    expect(keccak256(toHex(encoded))).toBe(VOUCHER_TYPEHASH);
  });
  it("structHash identique à SpotVault.hashVoucher", () => {
    expect(hashStruct({ data: voucherMessage(vector), primaryType: "Voucher", types: VOUCHER_TYPES })).toBe(STRUCT_HASH);
  });
  it("engagement de chasse identique à keccak256(abi.encode(day, uint32[5], salt))", () => {
    const c = keccak256(
      encodeAbiParameters(
        [{ type: "uint32" }, { type: "uint32[5]" }, { type: "bytes32" }],
        [20_702, [1, 2, 3, 4, 5], "0x4444444444444444444444444444444444444444444444444444444444444444"],
      ),
    );
    expect(c).toBe(HUNT_COMMITMENT);
  });
});

describe("signature", () => {
  const pk = "0x00000000000000000000000000000000000000000000000000000000000a11ce" as const;
  const domain = spotDomain(4663, "0x9999999999999999999999999999999999999999");

  it("LocalDevSigner signe et se vérifie", async () => {
    const signer = new LocalDevSigner(pk);
    const sig = await signer.signVoucher(domain, vector);
    expect(await verifyVoucher(domain, vector, sig, signer.address)).toBe(true);
    expect(await verifyVoucher(domain, { ...vector, amount: 1n }, sig, signer.address)).toBe(false);
    expect(await verifyVoucher(spotDomain(1, domain.verifyingContract as `0x${string}`), vector, sig, signer.address)).toBe(false);
  });

  it("chemin KMS : DER → (r,s) → signature Ethereum avec v retrouvé", async () => {
    const account = privateKeyToAccount(pk);
    const digest = voucherDigest(domain, vector);
    const raw = await account.sign({ hash: digest });
    const r = BigInt(`0x${raw.slice(2, 66)}`);
    const s = BigInt(`0x${raw.slice(66, 130)}`);
    const der = encodeDer(r, s);
    const decoded = decodeDer(der);
    expect(decoded.r).toBe(r);
    expect(decoded.s).toBe(s);
    const sig = await toEthSignature(digest, r, s, account.address);
    expect(await verifyVoucher(domain, vector, sig, account.address)).toBe(true);
    // un s « haut » est normalisé
    const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
    const sig2 = await toEthSignature(digest, r, N - s, account.address);
    expect(sig2).toBe(sig);
  });

  it("adresse depuis une clé publique SPKI", () => {
    const account = privateKeyToAccount(pk);
    const pub = account.publicKey; // 0x04 || X || Y
    const spki = new Uint8Array([0x30, 0x56, 0x30, 0x10, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a, 0x03, 0x42, 0x00, ...Buffer.from(pub.slice(2), "hex")]);
    expect(addressFromSpki(spki).toLowerCase()).toBe(account.address.toLowerCase());
  });

  it("nonces uniques et croissants", async () => {
    const n = new NonceSource();
    const a = await n.next(1_788_625_306_000);
    const b = await n.next(1_788_625_306_500);
    const c = await n.next(1_788_625_307_000);
    expect(a).not.toBe(b);
    expect(b < c).toBe(true);
    expect(a).toBe((1_788_625_306n << 20n) | 0n);
    expect(c < 2n ** 64n).toBe(true);
  });
});

function encodeDer(r: bigint, s: bigint): Uint8Array {
  const int = (x: bigint) => {
    let hex = x.toString(16);
    if (hex.length % 2) hex = `0${hex}`;
    let b = Buffer.from(hex, "hex");
    if ((b[0] as number) & 0x80) b = Buffer.concat([Buffer.from([0]), b]);
    return Buffer.concat([Buffer.from([0x02, b.length]), b]);
  };
  const body = Buffer.concat([int(r), int(s)]);
  return new Uint8Array(Buffer.concat([Buffer.from([0x30, body.length]), body]));
}
