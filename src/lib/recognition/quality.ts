/**
 * Enrollment quality gates. V2 grabbed 50 frames blindly and trained on
 * blurry/dark junk; here each capture is scored and rejected with a human
 * readable reason before it counts toward the target.
 *
 * All metrics operate on a Float32Array grayscale crop (0-255) as produced by
 * lbph.toGray — pure math, unit-testable, identical in browser and Node.
 */

import { laplacianVariance, toGray } from "./lbph";

export const QUALITY_LIMITS = {
  brightnessMin: 38,
  brightnessMax: 225,
  /** laplacian variance floor on a 160×160 crop; below ⇒ motion/defocus blur */
  sharpnessMin: 55,
  /** crop must fill at least this fraction of the expected face area */
  minFacePx: 96,
} as const;

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureQuality {
  brightness: number;
  sharpness: number;
  /** 0..1 — penalty for face touching frame edges */
  framing: number;
  /** aggregate 0..1 used to rank captures; best N are stored */
  score: number;
  rejectReason: string | null;
}

export function assessGrayFace(gray: Float32Array, width: number, height: number, facePx: number): CaptureQuality {
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i]!;
  const brightness = sum / Math.max(1, gray.length);

  const sharpness = laplacianVariance(gray, width, height);

  // Edge-clipping proxy: variance near the borders vs center.
  const border = edgeEnergyRatio(gray, width, height);
  const framing = Math.max(0, Math.min(1, 1 - border * 2.5));

  let rejectReason: string | null = null;
  if (facePx < QUALITY_LIMITS.minFacePx) rejectReason = "Face too small — move closer";
  else if (brightness < QUALITY_LIMITS.brightnessMin) rejectReason = "Too dark — add light";
  else if (brightness > QUALITY_LIMITS.brightnessMax) rejectReason = "Overexposed — reduce glare";
  else if (sharpness < QUALITY_LIMITS.sharpnessMin) rejectReason = "Blurry — hold still";
  else if (framing < 0.35) rejectReason = "Face partly out of frame";

  const bScore = brightnessScore(brightness);
  const sScore = Math.min(1, sharpness / 400);
  const score = rejectReason ? 0 : 0.45 * sScore + 0.3 * bScore + 0.25 * framing;

  return { brightness, sharpness, framing, score, rejectReason };
}

export function assessRgbaFace(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  facePx: number,
): CaptureQuality {
  return assessGrayFace(toGray(rgba, width, height), width, height, facePx);
}

function brightnessScore(b: number): number {
  const mid = 130;
  const dist = Math.abs(b - mid) / mid;
  return Math.max(0, 1 - dist);
}

function edgeEnergyRatio(gray: Float32Array, width: number, height: number): number {
  const band = Math.max(2, Math.floor(width * 0.04));
  let edge = 0;
  let n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isEdge = x < band || y < band || x >= width - band || y >= height - band;
      if (!isEdge) continue;
      const i = y * width + x;
      if (x > 0 && y > 0) {
        edge += Math.abs(gray[i]! - gray[i - 1]!) + Math.abs(gray[i]! - gray[i - width]!);
        n++;
      }
    }
  }
  const center = Math.max(1, n);
  const centerEnergy = (() => {
    let e = 0;
    let c = 0;
    for (let y = band + 1; y < height - band - 1; y += 2) {
      for (let x = band + 1; x < width - band - 1; x += 2) {
        const i = y * width + x;
        e += Math.abs(gray[i]! - gray[i - 1]!) + Math.abs(gray[i]! - gray[i - width]!);
        c++;
      }
    }
    return c ? e / c : 0;
  })();
  if (centerEnergy === 0) return edge > 0 ? 1 : 0;
  return Math.min(1, edge / center / centerEnergy / 2);
}
