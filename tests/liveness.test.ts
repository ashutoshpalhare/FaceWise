import { describe, expect, it } from "vitest";
import { evaluateLiveness, frameMotionEnergy } from "@/lib/recognition/liveness";

describe("passive liveness heuristic", () => {
  it("reports ~zero motion for a frozen frame (printed photo scenario)", () => {
    const f = new Float32Array(48 * 48).fill(120);
    expect(frameMotionEnergy(f, f.slice())).toBe(0);
    const v = evaluateLiveness([0, 0, 0, 0], 0.015);
    expect(v.pass).toBe(false);
    expect(v.score).toBe(0);
  });

  it("passes when the ROI micro-moves across ≥2 samples", () => {
    const a = new Float32Array(64).fill(100);
    const b = new Float32Array(64).fill(160); // 60/255 ≈ 0.235 mean abs diff
    const energy = frameMotionEnergy(a, b);
    expect(energy).toBeGreaterThan(0.015);
    const v = evaluateLiveness([energy, energy, energy], 0.015);
    expect(v.pass).toBe(true);
    expect(v.framesUsed).toBe(3);
  });

  it("a single sample can never pass — one frame proves nothing", () => {
    expect(evaluateLiveness([0.9], 0.015).pass).toBe(false);
    expect(evaluateLiveness([], 0.015).pass).toBe(false);
  });

  it("forgets old history — only the last 8 samples are averaged", () => {
    const samples = [...Array(6).fill(5), ...Array(9).fill(0.01)];
    const v = evaluateLiveness(samples, 0.5);
    expect(v.score).toBeCloseTo(0.01, 5);
    expect(v.framesUsed).toBe(8);
  });
});
