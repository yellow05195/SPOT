import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const PROD = { NODE_ENV: "production", DATABASE_URL: "postgres://x", REDIS_URL: "redis://x", SIGNER_KMS_KEY_ID: "kms", S3_BUCKET: "b" };

describe("configuration", () => {
  it("FRAGMENTS_ENABLED : vrai par défaut, faux pour 0/false/no/off, insensible à la casse", () => {
    expect(loadConfig({}).FRAGMENTS_ENABLED).toBe(true);
    expect(loadConfig({ FRAGMENTS_ENABLED: "true" }).FRAGMENTS_ENABLED).toBe(true);
    for (const v of ["0", "false", "FALSE", "no", "off", " Off "]) expect(loadConfig({ FRAGMENTS_ENABLED: v }).FRAGMENTS_ENABLED).toBe(false);
  });

  it("ALLOW_HOT_SIGNER : la clé en clair est refusée en production sauf opt-in explicite", () => {
    expect(() => loadConfig({ ...PROD, SIGNER_KMS_KEY_ID: undefined, SIGNER_DEV_PRIVATE_KEY: KEY })).toThrow(/SIGNER_DEV_PRIVATE_KEY est interdite/);
    const cfg = loadConfig({ ...PROD, SIGNER_KMS_KEY_ID: undefined, SIGNER_DEV_PRIVATE_KEY: KEY, ALLOW_HOT_SIGNER: "true" });
    expect(cfg.ALLOW_HOT_SIGNER).toBe(true);
    expect(cfg.SIGNER_DEV_PRIVATE_KEY).toBe(KEY);
    expect(() => loadConfig({ ...PROD, SIGNER_KMS_KEY_ID: undefined })).toThrow(/SIGNER_KMS_KEY_ID requis/);
    // hors production, la clé en clair passe sans opt-in
    expect(loadConfig({ SIGNER_DEV_PRIVATE_KEY: KEY }).SIGNER_DEV_PRIVATE_KEY).toBe(KEY);
  });

  it("stockage en production : S3_BUCKET ou MEDIA_LOCAL_DIR (avec avertissement), sinon erreur", () => {
    expect(() => loadConfig({ ...PROD, S3_BUCKET: undefined })).toThrow(/S3_BUCKET requis/);
    const warnings: string[] = [];
    const cfg = loadConfig({ ...PROD, S3_BUCKET: undefined, MEDIA_LOCAL_DIR: "/data/media", PUBLIC_MEDIA_BASE_URL: "https://api.example.com/media" }, warnings);
    expect(cfg.MEDIA_LOCAL_DIR).toBe("/data/media");
    expect(cfg.PUBLIC_MEDIA_BASE_URL).toBe("https://api.example.com/media");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/S3_BUCKET absent/);
    expect(loadConfig(PROD, warnings)).toBeTruthy();
    expect(warnings).toHaveLength(1);
    expect(() => loadConfig({ ...PROD, DATABASE_URL: undefined })).toThrow(/DATABASE_URL et REDIS_URL/);
  });
});
