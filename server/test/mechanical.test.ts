import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  analyzeSensors,
  clockSkewOk,
  hasEmbeddedMetadata,
  identicalBytes,
  isStandardResolution,
  mechanicalChecks,
} from "../src/checks/mechanical.js";
import type { SensorSample } from "../src/domain/types.js";
import { texture, toPng, addNoise, seeded } from "./synthetic.js";

function humanSensors(n = 45, seed = 3): SensorSample[] {
  const rnd = seeded(seed);
  const out: SensorSample[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      t: i * 33,
      ax: 0.02 * (rnd() - 0.5) + 0.01 * Math.sin(i / 7),
      ay: 0.03 * (rnd() - 0.5),
      az: 9.81 + 0.05 * (rnd() - 0.5),
      gx: 0.01 * (rnd() - 0.5),
      gy: 0.02 * (rnd() - 0.5),
      gz: 0.01 * (rnd() - 0.5),
    });
  }
  return out;
}

describe("capteurs", () => {
  it("accepte une main humaine", () => {
    expect(analyzeSensors(humanSensors()).reject).toBeNull();
  });
  it("rejette des capteurs strictement nuls", () => {
    const zero = humanSensors().map((s) => ({ ...s, ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0 }));
    expect(analyzeSensors(zero).reject).toBe("capteurs immobiles");
  });
  it("rejette une sinusoïde parfaite", () => {
    const sine: SensorSample[] = Array.from({ length: 45 }, (_, i) => ({
      t: i * 33,
      ax: 0.1 * Math.sin(i / 10),
      ay: 0.1 * Math.cos(i / 10),
      az: 9.81 + 0.1 * Math.sin(i / 10),
      gx: 0.05 * Math.sin(i / 10),
      gy: 0.05 * Math.cos(i / 10),
      gz: 0.05 * Math.sin(i / 10),
    }));
    expect(analyzeSensors(sine).reject).toBe("capteurs trop réguliers");
  });
  it("rejette un journal trop court", () => {
    expect(analyzeSensors(humanSensors(5)).reject).toBe("capteurs immobiles");
  });
});

describe("horloge, résolution, identité", () => {
  it("écart d'horloge", () => {
    expect(clockSkewOk(1000, 1000 + 19_999)).toBe(true);
    expect(clockSkewOk(1000, 1000 + 20_001)).toBe(false);
    expect(clockSkewOk(1000 + 25_000, 1000)).toBe(false);
  });
  it("résolutions standard", () => {
    expect(isStandardResolution(1920, 1080)).toBe(true);
    expect(isStandardResolution(1080, 1920)).toBe(true);
    expect(isStandardResolution(1234, 777)).toBe(false);
  });
  it("images identiques au bit près", async () => {
    const a = await toPng(texture(64, 64), 64, 64);
    expect(identicalBytes(a, Buffer.from(a))).toBe(true);
    const b = await toPng(addNoise(texture(64, 64), 3), 64, 64);
    expect(identicalBytes(a, b)).toBe(false);
  });
});

describe("EXIF", () => {
  it("détecte des métadonnées embarquées", async () => {
    const plain = await toPng(texture(64, 64), 64, 64);
    expect(await hasEmbeddedMetadata(plain)).toBe(false);
    const withExif = await sharp(plain)
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: "quelqu'un" } } })
      .toBuffer();
    expect(await hasEmbeddedMetadata(withExif)).toBe(true);
  });
});

describe("mechanicalChecks", () => {
  it("chaîne complète, ordre des rejets", async () => {
    const t = texture(640, 480, 5);
    const a = await toPng(t, 640, 480);
    const b = await toPng(addNoise(t, 4), 640, 480);
    const now = Date.now();
    const ok = await mechanicalChecks({ frameA: a, frameB: b, sensors: humanSensors(), clientTimestampMs: now, nowMs: now });
    expect(ok.reject).toBeNull();
    expect(ok.flags).toEqual([]);
    expect(ok.width).toBe(640);

    const same = await mechanicalChecks({ frameA: a, frameB: a, sensors: humanSensors(), clientTimestampMs: now, nowMs: now });
    expect(same.reject).toBe("images identiques");

    const late = await mechanicalChecks({ frameA: a, frameB: b, sensors: humanSensors(), clientTimestampMs: now - 60_000, nowMs: now });
    expect(late.reject).toBe("horloge incohérente");

    const odd = await toPng(texture(300, 200), 300, 200);
    const odd2 = await toPng(addNoise(texture(300, 200), 3), 300, 200);
    const flagged = await mechanicalChecks({ frameA: odd, frameB: odd2, sensors: humanSensors(), clientTimestampMs: now, nowMs: now });
    expect(flagged.reject).toBeNull();
    expect(flagged.flags).toContain("résolution non standard");
  });
});
