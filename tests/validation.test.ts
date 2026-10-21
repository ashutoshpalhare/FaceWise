import { describe, expect, it } from "vitest";
import { studentCreateSchema, attendanceRecordSchema, sessionCreateSchema } from "@/lib/validation";

describe("API input schemas (server-side validation)", () => {
  it("accepts a well-formed enrollment", () => {
    const parsed = studentCreateSchema.parse({
      fullName: "Asha Verma",
      enrollmentNo: "CS2024-042",
      email: "asha@x.edu",
      classLabel: "CS-A",
      templates: [{ kind: "sface128", vector: new Array(128).fill(0.01), quality: 0.9 }],
    });
    expect(parsed.fullName).toBe("Asha Verma");
  });

  it("trims and rejects junk names / enrollments", () => {
    expect(() => studentCreateSchema.parse({ fullName: " A ", enrollmentNo: "CS2024-042", templates: [] })).toThrow();
    expect(() => studentCreateSchema.parse({ fullName: "Asha", enrollmentNo: "has spaces!", templates: [] })).toThrow();
  });

  it("rejects out-of-range quality and non-finite vectors", () => {
    expect(() =>
      studentCreateSchema.parse({ fullName: "Asha V", enrollmentNo: "CS-1", templates: [{ kind: "sface128", vector: [1, Number.NaN], quality: 0.5 }] }),
    ).toThrow();
    expect(() =>
      studentCreateSchema.parse({ fullName: "Asha V", enrollmentNo: "CS-1", templates: [{ kind: "sface128", vector: [1], quality: 2 }] }),
    ).toThrow();
  });

  it("attendance payload requires uuid + method; confidence bounded 0..1", () => {
    const uuid = "11111111-1111-4111-8111-111111111111";
    expect(() => attendanceRecordSchema.parse({ studentId: "nope", method: "auto" })).toThrow();
    expect(() => attendanceRecordSchema.parse({ studentId: uuid, method: "auto", confidence: 1.5 })).toThrow();
    const ok = attendanceRecordSchema.parse({ studentId: uuid, method: "auto", confidence: 0.51, matchedVia: "lbph" });
    expect(ok.matchedVia).toBe("lbph");
  });

  it("session titles are required and length-bounded", () => {
    expect(() => sessionCreateSchema.parse({ title: "ab" })).toThrow();
    expect(sessionCreateSchema.parse({ title: "CS-A Lecture" }).autoRecord).toBe(true);
  });
});
