/**
 * CSV engine for bulk student import + attendance export. RFC-4180 style
 * parser written by hand (no dependency), with strict validation so one bad
 * row never corrupts the batch, and never trusts client-side uniqueness.
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

export function toCsv(headers: string[], rows: Array<Array<string | number | null>>): string {
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Student import
// ---------------------------------------------------------------------------

export interface StudentCsvRow {
  line: number;
  fullName: string;
  enrollmentNo: string;
  email: string | null;
  classLabel: string | null;
}

export interface StudentCsvError {
  line: number;
  message: string;
}

export interface StudentCsvResult {
  rows: StudentCsvRow[];
  errors: StudentCsvError[];
  totalDataLines: number;
}

const ENROLLMENT_RE = /^[A-Za-z0-9._-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Expected header: name, enrollment_no, email, class (email/class optional).
 * Returns validated rows + per-line errors. Duplicate enrollment numbers are
 * flagged *within the file*; cross-checking against the DB happens in the API.
 */
export function parseStudentCsv(text: string): StudentCsvResult {
  const parsed = parseCsv(text);
  const errors: StudentCsvError[] = [];
  if (parsed.length === 0) {
    return { rows: [], errors: [{ line: 1, message: "File is empty." }], totalDataLines: 0 };
  }
  const header = parsed[0]!.map((h) => h.trim().toLowerCase().replace(/[ -]/g, "_"));
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
  const nameCol = idx(["name", "full_name", "student_name"]);
  const enrollCol = idx(["enrollment_no", "enrollment", "enrollment_number", "roll_no", "roll"]);
  const emailCol = idx(["email", "email_address"]);
  const classCol = idx(["class", "class_label", "class_name", "batch"]);

  if (nameCol < 0) errors.push({ line: 1, message: 'Missing "name" column in header.' });
  if (enrollCol < 0) errors.push({ line: 1, message: 'Missing "enrollment_no" column in header.' });
  if (errors.length) return { rows: [], errors, totalDataLines: 0 };

  const rows: StudentCsvRow[] = [];
  const seen = new Map<string, number>();
  for (let r = 1; r < parsed.length; r++) {
    const line = r + 1; // 1-based, matching a spreadsheet view
    const cols = parsed[r]!;
    const fullName = (cols[nameCol] ?? "").trim().replace(/\s+/g, " ");
    const enrollmentNo = (cols[enrollCol] ?? "").trim();
    const email = emailCol >= 0 ? (cols[emailCol] ?? "").trim() || null : null;
    const classLabel = classCol >= 0 ? (cols[classCol] ?? "").trim() || null : null;
    const before = errors.length;

    if (fullName.length < 2 || fullName.length > 80) {
      errors.push({ line, message: "Name must be 2-80 characters." });
    }
    if (!ENROLLMENT_RE.test(enrollmentNo)) {
      errors.push({ line, message: "Enrollment no. must be 3-32 chars (letters, digits, . _ -)." });
    }
    if (email && !EMAIL_RE.test(email)) errors.push({ line, message: "Invalid email address." });
    if (classLabel && classLabel.length > 40) errors.push({ line, message: "Class label too long (max 40)." });

    const key = enrollmentNo.toLowerCase();
    if (errors.length === before) {
      const dupLine = seen.get(key);
      if (dupLine) {
        errors.push({ line, message: `Duplicate enrollment number (also on line ${dupLine}).` });
      } else {
        seen.set(key, line);
        rows.push({ line, fullName, enrollmentNo, email, classLabel });
      }
    }
  }
  return { rows, errors, totalDataLines: parsed.length - 1 };
}
