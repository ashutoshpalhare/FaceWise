/**
 * Matching math shared by browser and server. Pure functions, no DOM/Node
 * imports, so they are unit-tested directly (tests/similarity.test.ts).
 */

export type MatchKind = "sface128" | "lbph944";

export interface ThresholdPair {
  /** at or above → auto-acceptable identity match */
  accept: number;
  /** between review and accept → shown to the operator, never auto-recorded */
  review: number;
}

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || a.length === 0) return -1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

/**
 * Histogram intersection in [0,1] for LBPH descriptors.
 * Both inputs are L1-normalized *inside* the function, so the classic LBPH
 * layout (one L1-normalized sub-histogram per grid cell ⇒ total mass = 16)
 * compares correctly, and any global scale factor (illumination drift) is
 * ignored — only the distribution shape matters.
 */
export function histogramIntersection(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < a.length; i++) {
    sa += a[i]!;
    sb += b[i]!;
  }
  if (sa <= 0 || sb <= 0) return 0;
  let inter = 0;
  for (let i = 0; i < a.length; i++) {
    inter += Math.min(a[i]! / sa, b[i]! / sb);
  }
  return Math.max(0, Math.min(1, inter));
}

export function scoreFor(kind: MatchKind, query: number[], template: number[]): number {
  return kind === "sface128" ? cosineSimilarity(query, template) : histogramIntersection(query, template);
}

export interface StudentScore {
  studentId: string;
  score: number;
  templateIndex: number;
}

/** Best template per student (max over that student's templates), then best student. */
export function bestMatch(
  query: number[],
  roster: Array<{ studentId: string; templates: number[][] }>,
  kind: MatchKind,
): { best: StudentScore | null; runnerUp: StudentScore | null } {
  const perStudent: StudentScore[] = [];
  for (const entry of roster) {
    let bestScore = -Infinity;
    let bestIdx = -1;
    for (let t = 0; t < entry.templates.length; t++) {
      const s = scoreFor(kind, query, entry.templates[t]!);
      if (s > bestScore) {
        bestScore = s;
        bestIdx = t;
      }
    }
    if (bestIdx >= 0) perStudent.push({ studentId: entry.studentId, score: bestScore, templateIndex: bestIdx });
  }
  perStudent.sort((a, b) => b.score - a.score);
  return { best: perStudent[0] ?? null, runnerUp: perStudent[1] ?? null };
}

export type MatchStatus = "known" | "review" | "unknown";

export interface MatchDecision {
  status: MatchStatus;
  studentId: string | null;
  score: number;
  /** margin over runner-up — guards look-alike pairs from confident misID */
  margin: number;
}

/**
 * Three-zone policy (V2 had one binary 0-100 "confidence" and recorded
 * anything ≤ 70 distance): unknown faces never auto-record, review band
 * requires a human, known band auto-records subject to frame consensus.
 */
export function decideMatch(
  kind: MatchKind,
  thresholds: ThresholdPair,
  best: StudentScore | null,
  runnerUp: StudentScore | null,
  minMargin = kind === "lbph944" ? 0.02 : 0.05,
): MatchDecision {
  if (!best || best.score < thresholds.review) {
    return { status: "unknown", studentId: null, score: best?.score ?? 0, margin: 0 };
  }
  const margin = runnerUp ? best.score - runnerUp.score : 1;
  if (best.score >= thresholds.accept && margin >= minMargin) {
    return { status: "known", studentId: best.studentId, score: best.score, margin };
  }
  return { status: "review", studentId: best.studentId, score: best.score, margin };
}

/**
 * Temporal consensus: V2 recorded on a single frame, which produced flicker
 * misIDs. The face must resolve to the same identity in `required` of the most
 * recent `window` frames before attendance is written.
 */
export function frameConsensus(recent: MatchDecision[], required: number): MatchDecision | null {
  if (recent.length === 0) return null;
  const window = recent.slice(-Math.max(required, 3));
  const counts = new Map<string, { decision: MatchDecision; n: number }>();
  for (const d of window) {
    if (d.status !== "known" || !d.studentId) continue;
    const hit = counts.get(d.studentId);
    if (hit) {
      hit.n += 1;
      hit.decision = { ...d, score: Math.max(hit.decision.score, d.score) };
    } else {
      counts.set(d.studentId, { decision: d, n: 1 });
    }
  }
  let winner: { decision: MatchDecision; n: number } | null = null;
  for (const entry of counts.values()) {
    if (!winner || entry.n > winner.n) winner = entry;
  }
  if (winner && winner.n >= required) return winner.decision;
  return null;
}

/** Server-side re-validation used when accepting an auto-record request. */
export function isConfidenceAcceptable(
  kind: MatchKind,
  thresholds: ThresholdPair,
  confidence: number | null | undefined,
): boolean {
  if (typeof confidence !== "number" || Number.isNaN(confidence)) return false;
  return confidence >= thresholds.accept;
}
