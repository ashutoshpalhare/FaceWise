import { describe, expect, it } from "vitest";
import { parseCsv, parseStudentCsv, toCsv } from "@/lib/recognition/csv";

describe("parseCsv (RFC-4180 subset)", () => {
  it("handles quoted commas, escaped quotes and newlines", () => {
    const rows = parseCsv('name,note\n"Verma, Asha","said ""hi""\nnext line"\nplain,ok\n');
    expect(rows).toEqual([
      ["name", "note"],
      ["Verma, Asha", 'said "hi"\nnext line'],
      ["plain", "ok"],
    ]);
  });
  it("skips blank lines and normalizes CRLF", () => {
    expect(parseCsv("a,b\r\n\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("toCsv", () => {
  it("escapes delimiters and renders nulls as empty", () => {
    const csv = toCsv(["name", "class"], [["Ann,", null], ['"q"', "CS-A"]]);
    expect(csv).toBe('name,class\n"Ann,",\n"""q""",CS-A\n');
  });
});

describe("student import validation", () => {
  const header = "name,enrollment_no,email,class\n";

  it("accepts valid rows and optional columns", () => {
    const r = parseStudentCsv(header + "Asha Verma,CS2024-042,asha@x.edu,CS-A\nRohit K,CS2024-043,,\n");
    expect(r.rows).toHaveLength(2);
    expect(r.errors).toHaveLength(0);
    expect(r.rows[1]!.email).toBeNull();
  });

  it("flags bad enrollment, bad email and short names with line numbers", () => {
    const r = parseStudentCsv(header + "X,bad enrollment!,not-an-email,\nGood Name,OK-001,\n");
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
    expect(r.errors.some((e) => e.line === 2)).toBe(true);
    expect(r.rows.map((x) => x.enrollmentNo)).toEqual(["OK-001"]);
  });

  it("detects duplicate enrollment numbers within the file", () => {
    const r = parseStudentCsv(header + "Ann A,CS-1,a@example.com,\nAnn B,CS-1,b@example.com,\n");
    expect(r.rows).toHaveLength(1);
    expect(r.errors[0]!.message).toMatch(/duplicate/i);
    expect(r.errors[0]!.line).toBe(3);
  });

  it("requires a usable header", () => {
    expect(parseStudentCsv("student,roll\nA,1\n").errors[0]!.message).toMatch(/name/i);
    expect(parseStudentCsv("name\nAsha,CS-1\n").errors[0]!.message).toMatch(/enrollment/i);
    expect(parseStudentCsv("   ").errors[0]!.message).toMatch(/empty/i);
  });
});
