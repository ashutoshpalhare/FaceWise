/**
 * LBPH-style descriptor — the fallback pipeline when no neural model is
 * available (offline install, unsupported browser, blocked CDN).
 *
 * This mirrors what cv2.face.LBPHFaceRecognizer uses:
 *   L = Local binary pattern (uniform 59-bin), B = (implicit),
 *   P = fixed 4x4 spatial grid, H = histogram of LBP codes per cell.
 * Descriptor length = 16 cells × 59 bins = 944.
 *
 * Input is expected to be an already-cropped, already-resized face image
 * (160x160 in this app). Pure typed-array math — runs identically in Node
 * tests and the browser.
 */

export const LBPH_GRID = 4;
export const LBPH_BINS = 59; // 58 uniform codes + 1 "other"
export const LBPH_DIM = LBPH_GRID * LBPH_GRID * LBPH_BINS; // 944

/** Precomputed uniform-pattern table: popcount transitions ≤ 2 → own bin. */
const UNIFORM_MAP: number[] = (() => {
  const map = new Array<number>(256).fill(58);
  let next = 0;
  for (let code = 0; code < 256; code++) {
    let transitions = 0;
    for (let b = 0; b < 8; b++) {
      const cur = (code >> b) & 1;
      const nxt = (code >> ((b + 1) % 8)) & 1;
      if (cur !== nxt) transitions++;
    }
    if (transitions <= 2) map[code] = next++;
  }
  return map;
})();

export function toGray(rgba: ArrayLike<number>, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < width * height; i++, p += 4) {
    out[i] = 0.114 * rgba[p]! + 0.587 * rgba[p + 1]! + 0.299 * rgba[p + 2]!;
  }
  return out;
}

/** Mean absolute Laplacian over the image — sharpness proxy (blur detector). */
export function laplacianVariance(gray: Float32Array, width: number, height: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap =
        4 * gray[i]! - gray[i - 1]! - gray[i + 1]! - gray[i - width]! - gray[i + width]!;
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export function lbpCodes(gray: Float32Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array((width - 2) * (height - 2));
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const c = gray[y * width + x]!;
      let code = 0;
      // clockwise starting top-left
      if (gray[(y - 1) * width + (x - 1)]! >= c) code |= 1 << 0;
      if (gray[(y - 1) * width + x]! >= c) code |= 1 << 1;
      if (gray[(y - 1) * width + (x + 1)]! >= c) code |= 1 << 2;
      if (gray[y * width + (x + 1)]! >= c) code |= 1 << 3;
      if (gray[(y + 1) * width + (x + 1)]! >= c) code |= 1 << 4;
      if (gray[(y + 1) * width + x]! >= c) code |= 1 << 5;
      if (gray[(y + 1) * width + (x - 1)]! >= c) code |= 1 << 6;
      if (gray[y * width + (x - 1)]! >= c) code |= 1 << 7;
      out[(y - 1) * (width - 2) + (x - 1)] = UNIFORM_MAP[code]!;
    }
  }
  return out;
}

/**
 * Compute the 944-dim normalized LBPH descriptor for a cropped face.
 * `rgba` must be width*height*4 bytes (e.g. canvas ImageData for a 160×160
 * aligned face crop).
 */
export function computeLbphDescriptor(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
): number[] {
  if (width < 8 || height < 8) throw new Error("face crop too small for LBPH");
  const gray = toGray(rgba, width, height);
  const codes = lbpCodes(gray, width, height);
  const cw = width - 2;
  const ch = height - 2;
  const hist = new Array<number>(LBPH_DIM).fill(0);
  for (let y = 0; y < ch; y++) {
    const cellY = Math.min(LBPH_GRID - 1, Math.floor((y / ch) * LBPH_GRID));
    for (let x = 0; x < cw; x++) {
      const cellX = Math.min(LBPH_GRID - 1, Math.floor((x / cw) * LBPH_GRID));
      const bin = cellY * LBPH_GRID + cellX;
      hist[bin * LBPH_BINS + codes[y * cw + x]!]! += 1;
    }
  }
  // L1-normalize per cell so illumination drift matters less (classic LBPH).
  for (let cell = 0; cell < LBPH_GRID * LBPH_GRID; cell++) {
    let sum = 0;
    for (let b = 0; b < LBPH_BINS; b++) sum += hist[cell * LBPH_BINS + b]!;
    if (sum > 0) for (let b = 0; b < LBPH_BINS; b++) hist[cell * LBPH_BINS + b]! /= sum;
  }
  return hist;
}

export function isLikelyUniform(code: number): boolean {
  return UNIFORM_MAP[code]! < 58;
}
