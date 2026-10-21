import { sql } from "drizzle-orm";
import { db } from "@/db";
import { students } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ApiError, api, clientIp, readJson } from "@/lib/http";
import { csvImportSchema } from "@/lib/validation";
import { parseStudentCsv } from "@/lib/recognition/csv";

export const dynamic = "force-dynamic";

/**
 * Bulk student import. Validation happens server-side with the same parser the
 * UI previews with; enrollment numbers already in the DB are skipped per row
 * (never abort the batch, never double-insert).
 */
export async function POST(req: Request) {
  return api(req, async () => {
    const user = await requireUser(["admin", "teacher"]);
    const body = await readJson(req, csvImportSchema);
    const parsed = parseStudentCsv(body.csv);
    if (parsed.rows.length === 0 && parsed.errors.length === 0) {
      throw new ApiError(422, "empty", "No data rows found.");
    }

    const existing = await db
      .select({ enrollmentNo: students.enrollmentNo })
      .from(students)
      .where(sql`lower(${students.enrollmentNo}) in (${sql.join(
        parsed.rows.map((r) => sql`${r.enrollmentNo.toLowerCase()}`),
        sql`, `,
      )})`);
    const existingSet = new Set(existing.map((e) => e.enrollmentNo.toLowerCase()));

    const skipped = parsed.rows
      .filter((r) => existingSet.has(r.enrollmentNo.toLowerCase()))
      .map((r) => ({ line: r.line, message: "Enrollment already exists in database." }));

    const fresh = parsed.rows.filter((r) => !existingSet.has(r.enrollmentNo.toLowerCase()));

    if (body.dryRun) {
      return {
        ok: true,
        dryRun: true,
        willImport: fresh.length,
        errors: [...parsed.errors, ...skipped],
        preview: fresh.slice(0, 25),
      };
    }

    const created: string[] = [];
    await db.transaction(async (tx) => {
      for (const row of fresh) {
        const [s] = await tx
          .insert(students)
          .values({
            fullName: row.fullName,
            enrollmentNo: row.enrollmentNo,
            email: row.email,
            classLabel: row.classLabel,
            enrolledById: user.id,
          })
          .onConflictDoNothing()
          .returning({ id: students.id });
        if (s) created.push(s.id);
      }
    });

    await logAudit({
      userId: user.id,
      actorName: user.name,
      action: "student.bulk_import",
      entityType: "student",
      details: { created: created.length, skipped: skipped.length, invalid: parsed.errors.length },
      ip: clientIp(req),
    });
    return {
      ok: true,
      dryRun: false,
      imported: created.length,
      skipped,
      errors: parsed.errors,
    };
  });
}
