import { desc, eq, count, sql } from "drizzle-orm";
import { db } from "@/db";
import { attendanceRecords, faceTemplates, students } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ApiError, api, clientIp, readJson } from "@/lib/http";
import { config } from "@/lib/config";
import { studentCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const EXPECTED_DIM: Record<"sface128" | "lbph944", number> = { sface128: 128, lbph944: 944 };

export async function GET() {
  return api(undefined as unknown as Request, async () => {
    await requireUser();
    const rows = await db
      .select({
        id: students.id,
        fullName: students.fullName,
        enrollmentNo: students.enrollmentNo,
        email: students.email,
        classLabel: students.classLabel,
        status: students.status,
        templateCount: students.templateCount,
        templateKind: students.templateKind,
        createdAt: students.createdAt,
        attended: sql<number>`(select count(*)::int from attendance_records ar where ar.student_id = ${students.id})`.as("attended"),
      })
      .from(students)
      .orderBy(desc(students.createdAt))
      .limit(500);
    return { ok: true, students: rows };
  });
}

export async function POST(req: Request) {
  return api(req, async () => {
    const user = await requireUser(["admin", "teacher"]);
    const body = await readJson(req, studentCreateSchema);

    // Validate every template vector BEFORE touching the DB.
    const kinds = new Set(body.templates.map((t) => t.kind));
    if (kinds.size > 1) throw new ApiError(422, "mixed_kinds", "One enrollment must use a single template kind.");
    const templates = body.templates.map((t) => {
      if (t.vector.length !== EXPECTED_DIM[t.kind]) {
        throw new ApiError(422, "bad_vector", `${t.kind} requires exactly ${EXPECTED_DIM[t.kind]} dimensions.`);
      }
      if (!t.vector.every(Number.isFinite)) throw new ApiError(422, "bad_vector", "Vector contains non-finite numbers.");
      return { ...t, vector: t.vector.map((v) => Math.round(v * 1e5) / 1e5) };
    });

    const email = body.email ? body.email.toLowerCase() : null;

    const result = await db.transaction(async (tx) => {
      const dupes = await tx
        .select({ id: students.id, fullName: students.fullName })
        .from(students)
        .where(sql`lower(${students.enrollmentNo}) = lower(${body.enrollmentNo})`)
        .limit(1);
      if (dupes.length > 0) {
        throw new ApiError(409, "duplicate_enrollment", `Enrollment ${body.enrollmentNo} already exists.`);
      }
      const nameDupe = await tx
        .select({ id: students.id })
        .from(students)
        .where(sql`lower(${students.fullName}) = lower(${body.fullName})`)
        .limit(1);
      if (nameDupe.length > 0) {
        throw new ApiError(409, "duplicate_name", `A student named ${body.fullName} already exists.`);
      }

      const [student] = await tx
        .insert(students)
        .values({
          fullName: body.fullName,
          enrollmentNo: body.enrollmentNo,
          email,
          classLabel: body.classLabel ?? null,
          templateCount: 0,
          enrolledById: user.id,
        })
        .returning();

      if (templates.length > 0) {
        const top = templates.sort((a, b) => b.quality - a.quality).slice(0, config.enrollStoreTopTemplates);
        await tx.insert(faceTemplates).values(
          top.map((t) => ({
            studentId: student!.id,
            kind: t.kind,
            vector: t.vector,
            quality: t.quality,
          })),
        );
        await tx
          .update(students)
          .set({ templateCount: Math.min(templates.length, config.enrollStoreTopTemplates), templateKind: templates[0]!.kind })
          .where(eq(students.id, student!.id));
        const [updated] = await tx.select().from(students).where(eq(students.id, student!.id)).limit(1);
        return updated ?? student!;
      }
      return student!;
    });

    await logAudit({
      userId: user.id,
      actorName: user.name,
      action: "student.enroll",
      entityType: "student",
      entityId: result.id,
      details: { enrollmentNo: result.enrollmentNo, templates: result.templateCount, kind: result.templateKind },
      ip: clientIp(req),
    });
    return { ok: true, student: result };
  });
}


