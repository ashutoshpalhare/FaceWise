import { describe, expect, it } from "vitest";
import { computeLbphDescriptor, LBPH_DIM, lbpCodes, toGray, laplacianVariance } from "@/lib/recognition/lbph";
import { histogramIntersection } from "@/lib/recognition/similarity";
import { syntheticFace } from "./helpers";

describe("LBPH descriptor", () => {
  it("produces exactly 944 normalized bins", () => {
    const d = computeLbphDescriptor(syntheticFace(1), 160, 160);
    expect(d).toHaveLength(LBPH_DIM);
    expect(LBPH_DIM).toBe(944);
    d.forEach((v) => expect(v).toBeGreaterThanOrEqual(0));
    // 16 cells each L1-normalized ⇒ total = 16
    expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(16, 3);
  });

  it("is deterministic for identical input", () => {
    const img = syntheticFace(7);
    expect(computeLbphDescriptor(img, 160, 160)).toEqual(computeLbphDescriptor(img, 160, 160));
  });

  it("matches the same identity better under illumination shift (LBPH property)", () => {
    // near-zero noise ⇒ structural (identity) statistics dominate the histogram
    const base = computeLbphDescriptor(syntheticFace(11, 0, 0.15), 160, 160);
    const sameLighting = computeLbphDescriptor(syntheticFace(11, 45, 0.15), 160, 160);
    // different seeds ⇒ different structural landmark placement = different person
    const differentFace = computeLbphDescriptor(syntheticFace(12, 0, 0.15), 160, 160);
    const differentFace2 = computeLbphDescriptor(syntheticFace(13, 0, 0.15), 160, 160);
    const simSame = histogramIntersection(base, sameLighting);
    const simDiff = Math.max(histogramIntersection(base, differentFace), histogramIntersection(base, differentFace2));
    expect(simSame).toBeGreaterThan(simDiff);
    expect(simSame).toBeGreaterThan(0.9);
  });

  it("throws on crops that are too small", () => {
    expect(() => computeLbphDescriptor(new Uint8ClampedArray(4 * 4 * 4 * 4), 4, 4)).toThrow();
  });

  it("codes a constant neighborhood as a single uniform bin", () => {
    const w = 16;
    const h = 16;
    const flat = new Float32Array(w * h).fill(120);
    const codes = lbpCodes(flat, w, h);
    // all neighbors ≥ center ⇒ raw code 255 ⇒ one specific uniform bin (not necessarily 0)
    expect(codes.every((c) => c === codes[0])).toBe(true);
    expect(codes[0]!).toBeLessThan(58); // it is a *uniform* pattern
  });
});

describe("grayscale + blur metrics", () => {
  it("toGray weights follow luma", () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    const g = toGray(rgba, 2, 1);
    expect(g[0]).toBeCloseTo(255, 0);
    expect(g[1]).toBe(0);
  });
  it("sharp checkerboards have much higher laplacian variance than flat gray", () => {
    const w = 64, h = 64;
    const flat = new Float32Array(w * h).fill(128);
    const check = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) check[y * w + x] = (x + y) % 2 === 0 ? 200 : 40;
    expect(laplacianVariance(check, w, h)).toBeGreaterThan(laplacianVariance(flat, w, h) + 1000);
  });
});
