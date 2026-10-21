import { describe, expect, it } from "vitest";
import { assessRgbaFace, QUALITY_LIMITS } from "@/lib/recognition/quality";
import { syntheticFace } from "./helpers";

function flatGray(value: number): Uint8ClampedArray {
  const size = 160;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }
  return data;
}

describe("enrollment capture quality gate", () => {
  it("accepts a well-lit sharp crop", () => {
    const q = assessRgbaFace(syntheticFace(3), 160, 160, 140);
    expect(q.rejectReason).toBeNull();
    expect(q.score).toBeGreaterThan(0);
  });

  it("rejects too-dark frames", () => {
    const q = assessRgbaFace(syntheticFace(3, -140), 160, 160, 140);
    expect(q.rejectReason).toMatch(/dark/i);
    expect(q.score).toBe(0);
  });

  it("rejects overexposed frames", () => {
    const q = assessRgbaFace(syntheticFace(3, 175), 160, 160, 140);
    expect(q.brightness).toBeGreaterThan(QUALITY_LIMITS.brightnessMax);
    expect(q.rejectReason).toMatch(/overexposed/i);
  });

  it("rejects blurry frames (low laplacian variance)", () => {
    // zero local contrast ⇒ variance below the sharpness floor ⇒ "blurry"
    const q = assessRgbaFace(flatGray(150), 160, 160, 140);
    expect(q.sharpness).toBeLessThan(QUALITY_LIMITS.sharpnessMin);
    expect(q.rejectReason).toMatch(/blurry/i);
  });

  it("rejects faces that are too small", () => {
    const q = assessRgbaFace(syntheticFace(3), 160, 160, 40);
    expect(q.rejectReason).toMatch(/too small/i);
  });
});
