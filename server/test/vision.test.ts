import { describe, it, expect } from "vitest";
import { parallaxCheck } from "../src/vision/parallax.js";
import { moireCheck } from "../src/vision/moire.js";
import { borderCheck, luminanceCheck } from "../src/vision/frame.js";
import { phash, hamming, backgroundPhash, DUPLICATE_DISTANCE } from "../src/vision/phash.js";
import { fft1d } from "../src/vision/fft.js";
import { texture, warp, addNoise, addScreenGrid, addFrame, toPng, toJpeg, flat } from "./synthetic.js";

const W = 640;
const H = 480;

describe("parallaxe", () => {
  it("un déplacement uniforme (photo d'écran) est plan", async () => {
    const base = texture(W, H, 11, 5);
    const a = await toPng(base, W, H);
    const b = await toPng(addNoise(warp(base, W, H, () => [2, 1]), 2, 9), W, H);
    const r = await parallaxCheck(a, b);
    expect(r.texturedBlocks).toBeGreaterThan(50);
    expect(r.variance).toBeLessThan(0.6);
    expect(r.planar).toBe(true);
  });

  it("un champ non uniforme (objet proche + fond) n'est pas plan", async () => {
    const base = texture(W, H, 12, 5);
    // le tiers central (l'objet) bouge de 5 px, le fond de 1 px
    const moved = warp(base, W, H, (x) => (x > W / 3 && x < (2 * W) / 3 ? [5, 2] : [1, 0]));
    const a = await toPng(base, W, H);
    const b = await toPng(addNoise(moved, 2, 9), W, H);
    const r = await parallaxCheck(a, b);
    expect(r.variance).toBeGreaterThan(0.6);
    expect(r.planar).toBe(false);
  });

  it("sans texture, on ne conclut pas", async () => {
    const a = await toPng(flat(W, H, 128), W, H);
    const r = await parallaxCheck(a, a);
    expect(r.texturedBlocks).toBe(0);
    expect(r.planar).toBe(false);
  });
});

describe("moiré", () => {
  it("fft1d : une sinusoïde donne un pic", () => {
    const n = 64;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 8 * i) / n);
    fft1d(re, im);
    const mags = Array.from(re, (r, i) => Math.hypot(r, im[i] as number));
    const peak = mags.indexOf(Math.max(...mags));
    expect(peak === 8 || peak === n - 8).toBe(true);
  });

  it("une scène naturelle n'a pas de moiré", async () => {
    const img = await toJpeg(addNoise(texture(W, H, 21, 6), 6), W, H);
    const r = await moireCheck(img);
    expect(r.detected).toBe(false);
  });

  it("une grille d'écran est détectée", async () => {
    const img = await toPng(addScreenGrid(texture(W, H, 21, 6), W, H, 5, 18), W, H);
    const r = await moireCheck(img);
    expect(r.flaggedTiles / r.totalTiles).toBeGreaterThan(0.2);
    expect(r.detected).toBe(true);
  });
});

describe("cadre et luminance", () => {
  it("un cadre sombre autour de la scène est détecté", async () => {
    const framed = addFrame(texture(W, H, 31, 6), W, H, 40, 10);
    const r = await borderCheck(await toPng(framed, W, H));
    expect(r.detected).toBe(true);
  });
  it("une scène sans cadre passe", async () => {
    const r = await borderCheck(await toPng(texture(W, H, 31, 6), W, H));
    expect(r.detected).toBe(false);
  });
  it("une luminance trop homogène est suspecte", async () => {
    const dull = await toPng(addNoise(flat(W, H, 140), 3), W, H);
    expect((await luminanceCheck(dull)).suspicious).toBe(true);
    const lively = await toPng(texture(W, H, 3), W, H);
    expect((await luminanceCheck(lively)).suspicious).toBe(false);
  });
});

describe("pHash", () => {
  it("la même photo re-encodée reste proche, une autre photo est loin", async () => {
    const base = texture(W, H, 41, 8);
    const a = await phash(await toPng(base, W, H));
    const b = await phash(await toJpeg(addNoise(base, 4), W, H, 70));
    expect(hamming(a, b)).toBeLessThan(DUPLICATE_DISTANCE);
    const c = await phash(await toPng(texture(W, H, 99, 8), W, H));
    expect(hamming(a, c)).toBeGreaterThanOrEqual(DUPLICATE_DISTANCE);
    expect(hamming(a, a)).toBe(0);
    expect(a.length).toBe(8);
  });
  it("l'arrière-plan (moitié haute) est comparable indépendamment du bas", async () => {
    const base = texture(W, H, 51, 8);
    const other = texture(W, H, 52, 8);
    const mixed = new Uint8Array(base);
    mixed.set(other.subarray((H / 2) * W), (H / 2) * W); // même haut, bas différent
    const bgA = await backgroundPhash(await toPng(base, W, H));
    const bgB = await backgroundPhash(await toPng(mixed, W, H));
    expect(hamming(bgA, bgB)).toBeLessThan(DUPLICATE_DISTANCE);
    const full = hamming(await phash(await toPng(base, W, H)), await phash(await toPng(mixed, W, H)));
    expect(full).toBeGreaterThan(0);
  });
});
