/** Deterministic PRNG + synthetic face images for pure-logic tests. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Synthetic "face" RGBA buffer (160×160): an ellipse of skin-ish values with a
 * seeded micro-texture. `seed` changes the texture identity; lighting shifts the
 * base level but not the pattern (what LBPH should survive).
 */
export function syntheticFace(seed: number, brightness = 0, contrast = 1): Uint8ClampedArray {
  const size = 160;
  const rnd = mulberry32(seed);
  const data = new Uint8ClampedArray(size * size * 4);
  // fixed texture field derived from seed so same seed ⇒ same pattern
  const pattern = new Float32Array(size * size);
  const p = mulberry32(seed * 7919 + 13);
  for (let i = 0; i < pattern.length; i++) pattern[i] = p();
  // Structural landmarks vary with the seed — identity lives in *structure*,
  // not random noise (random textures are statistically near-identical, which
  // would make any histogram matcher accept everyone!).
  const eyeRow = 60 + (seed % 9) * 4; // 60..92
  const mouthRow = 112 + ((seed * 3) % 7) * 3; // 112..130
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - size / 2) / (size * 0.38);
      const dy = (y - size / 2) / (size * 0.45);
      const inside = dx * dx + dy * dy <= 1;
      const i = y * size + x;
      const base = inside ? 150 : 40;
      const tex = inside ? (pattern[i]! - 0.5) * 60 * contrast : 0;
      const eyeBand = inside && Math.abs(y - eyeRow) < 5 && (Math.abs(x - 60) < 14 || Math.abs(x - 100) < 14) ? -70 : 0;
      const mouthBand = inside && Math.abs(y - mouthRow) < 4 && Math.abs(x - 80) < 22 ? -55 : 0;
      // seed-phase block pattern ⇒ coarse structural "face geometry" that
      // genuinely changes local LBP statistics per identity (and survives
      // illumination shifts, exactly like a real face does for LBPH).
      const block = inside ? [0, -55, 45][(Math.floor(x / 24) + Math.floor(y / 24) + seed) % 3]! : 0;
      const v = Math.max(0, Math.min(255, base + tex + eyeBand + mouthBand + block + brightness));
      const o = i * 4;
      data[o] = Math.min(255, v + 15);
      data[o + 1] = v;
      data[o + 2] = Math.max(0, v - 20);
      data[o + 3] = 255;
    }
  }
  void rnd;
  return data;
}

export function unitVector(n: number, angle: number): number[] {
  // 2 "distinct" dims + zeros so cosine similarity is controllable in tests
  const v = new Array<number>(n).fill(0);
  v[0] = Math.cos(angle);
  v[1] = Math.sin(angle);
  return v;
}
