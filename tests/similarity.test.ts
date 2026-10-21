import { describe, expect, it } from "vitest";
import {
  bestMatch,
  cosineSimilarity,
  decideMatch,
  frameConsensus,
  histogramIntersection,
  isConfidenceAcceptable,
  type MatchDecision,
} from "@/lib/recognition/similarity";
import { unitVector } from "./helpers";

const T = { accept: 0.42, review: 0.33 };

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors and 0 for orthogonal", () => {
    const a = unitVector(128, 0.7);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 5);
    expect(cosineSimilarity(unitVector(128, 0), unitVector(128, Math.PI / 2))).toBeCloseTo(0, 5);
  });
  it("rejects mismatched lengths", () => {
    expect(cosineSimilarity([1, 2], [1])).toBe(-1);
  });
});

describe("histogramIntersection", () => {
  const raw = () => new Array(944).fill(0).map((_, i) => (i % 8) / 8 + 0.01);

  it("is 1 for identical distributions regardless of total mass (LBPH cells sum to 16)", () => {
    expect(histogramIntersection(raw(), raw())).toBeCloseTo(1, 5);
    const scaled = raw().map((v) => v * 0.5); // global illumination-style scaling must be ignored
    expect(histogramIntersection(raw(), scaled)).toBeCloseTo(1, 5);
    // same shape but as probability vector vs 16-mass version
    const sum = raw().reduce((a, b) => a + b, 0);
    const prob = raw().map((v) => v / sum);
    expect(histogramIntersection(prob, raw())).toBeCloseTo(1, 5);
  });

  it("is 0 for disjoint supports and 0.5 for half-overlapping mass", () => {
    const a = new Array(944).fill(0);
    a[0] = 1;
    const b = new Array(944).fill(0);
    b[1] = 1;
    expect(histogramIntersection(a, b)).toBe(0);

    // b keeps only the even bins (rescaled) ⇒ intersection = even-mass share of h
    const h = raw();
    const total = h.reduce((a, b) => a + b, 0);
    const evenMass = h.reduce((a, v, i) => (i % 2 === 0 ? a + v : a), 0);
    const half = h.map((v, i) => (i % 2 === 0 ? v : 0));
    expect(histogramIntersection(h, half)).toBeCloseTo(evenMass / total, 5);
    expect(histogramIntersection(h, half)).toBeLessThan(1);
  });

  it("returns 0 for empty or all-zero inputs", () => {
    expect(histogramIntersection([], [])).toBe(0);
    expect(histogramIntersection(new Array(4).fill(0), new Array(4).fill(1))).toBe(0);
  });
});

describe("bestMatch", () => {
  const roster = [
    { studentId: "A", templates: [unitVector(128, 0.0), unitVector(128, 0.05)] },
    { studentId: "B", templates: [unitVector(128, 1.4)] },
  ];
  it("picks the student with the best template", () => {
    const { best } = bestMatch(unitVector(128, 0.03), roster, "sface128");
    expect(best?.studentId).toBe("A");
    expect(best!.score).toBeGreaterThan(0.9);
  });
  it("handles an empty roster (cold-start: everything is unknown)", () => {
    const { best, runnerUp } = bestMatch(unitVector(128, 0.1), [], "sface128");
    expect(best).toBeNull();
    expect(runnerUp).toBeNull();
  });
});

describe("decideMatch — three-zone policy", () => {
  it("accepts above threshold", () => {
    const d = decideMatch("sface128", T, { studentId: "A", score: 0.55, templateIndex: 0 }, null);
    expect(d.status).toBe("known");
    expect(d.studentId).toBe("A");
  });
  it("puts the review band in review, not known (V2 recorded these)", () => {
    const d = decideMatch("sface128", T, { studentId: "A", score: 0.35, templateIndex: 0 }, null);
    expect(d.status).toBe("review");
  });
  it("returns unknown below review and for nobody", () => {
    expect(decideMatch("sface128", T, { studentId: "A", score: 0.2, templateIndex: 0 }, null).status).toBe("unknown");
    expect(decideMatch("sface128", T, null, null).status).toBe("unknown");
  });
  it("blocks near-tie look-alikes into review via margin", () => {
    const best = { studentId: "A", score: 0.8, templateIndex: 0 };
    const runnerUp = { studentId: "B", score: 0.78, templateIndex: 0 };
    const d = decideMatch("sface128", T, best, runnerUp);
    expect(d.status).toBe("review");
    expect(d.margin).toBeCloseTo(0.02, 5);
  });
});

describe("frameConsensus — temporal duplicate/misID protection", () => {
  const known = (studentId: string, score = 0.6): MatchDecision => ({ status: "known", studentId, score, margin: 1 });
  const unknown: MatchDecision = { status: "unknown", studentId: null, score: 0.1, margin: 0 };

  it("refuses a single-frame recording", () => {
    expect(frameConsensus([known("A")], 2)).toBeNull();
  });
  it("confirms after N agreeing frames", () => {
    const r = frameConsensus([known("A"), unknown, known("A")], 2);
    expect(r?.studentId).toBe("A");
  });
  it("does not flip-flop between identities", () => {
    const r = frameConsensus([known("A"), known("B"), known("A")], 3);
    expect(r).toBeNull();
  });
  it("uses the best score of the agreeing run", () => {
    const r = frameConsensus([known("A", 0.5), known("A", 0.7)], 2);
    expect(r?.score).toBeCloseTo(0.7, 5);
  });
});

describe("server re-validation of client confidence", () => {
  it("rejects missing, NaN and below-threshold confidences", () => {
    expect(isConfidenceAcceptable("sface128", T, null)).toBe(false);
    expect(isConfidenceAcceptable("sface128", T, Number.NaN)).toBe(false);
    expect(isConfidenceAcceptable("sface128", T, 0.41)).toBe(false);
    expect(isConfidenceAcceptable("sface128", T, 0.42)).toBe(true);
  });
  it("applies the LBPH band when the fallback produced the match", () => {
    const L = { accept: 0.62, review: 0.52 };
    expect(isConfidenceAcceptable("lbph944", L, 0.7)).toBe(true);
    expect(isConfidenceAcceptable("lbph944", L, 0.6)).toBe(false);
  });
});
