/**
 * Practical, honest liveness support.
 *
 * What this DOES: a passive motion-energy heuristic. The face ROI is compared
 * across recent frames; a printed photo or frozen picture presented to the
 * camera produces near-zero pixel variance and is rejected, while a live face
 * micro-moves constantly (pulse-driven jitter, respiration, eye motion).
 *
 * What this does NOT do — do not overstate it:
 *  - It will NOT stop a video replay on a phone/tablet screen (that screen
 *    moves just like a face). Mitigation: the "review band" always requires a
 *    human, and recordings include livenessScore for the audit trail.
 *  - It is NOT certified ISO 30107-3 PAD. For adversarial environments use a
 *    dedicated vendor (e.g. InsightFace anti-spoof models or a commercial
 *    SDK) and keep face attendance advisory-only.
 */

export function frameMotionEnergy(prev: Float32Array, next: Float32Array): number {
  if (prev.length !== next.length || prev.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < prev.length; i++) {
    sum += Math.abs(next[i]! - prev[i]!);
  }
  return sum / prev.length / 255;
}

export interface LivenessVerdict {
  score: number;
  pass: boolean;
  framesUsed: number;
}

/**
 * score = mean pairwise motion energy of the last N ROI samples.
 * pass requires both the threshold and ≥2 samples (one frame proves nothing).
 */
export function evaluateLiveness(samples: number[], minMotion: number): LivenessVerdict {
  if (samples.length < 2) return { score: samples[0] ?? 0, pass: false, framesUsed: samples.length };
  const recent = samples.slice(-8);
  const score = recent.reduce((a, b) => a + b, 0) / recent.length;
  return { score, pass: score >= minMotion, framesUsed: recent.length };
}
