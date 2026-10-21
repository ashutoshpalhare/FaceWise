import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { attendanceRecords, faceTemplates, students } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ApiError, api, clientIp, readJson } from "@/lib/http";
import { studentPatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return api(_req, async () => {
    await requireUser();
    const { id } = await ctx.params;
    const [student] = await db.select().from(students).where(eq(students.id, id)).limit(1);
    if (!student) throw new ApiError(404, "not_found", "Student not found.");
    const templates = await db
      .select({ id: faceTemplates.id, kind: faceTemplates.kind, quality: faceTemplates.quality, createdAt: faceTemplates.createdAt })
      .from(faceTemplates)
      .where(eq(faceTemplates.studentId, id));
    return { ok: true, student, templates };
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return api(req, async () => {
    const user = await requireUser(["admin", "teacher"]);
    const { id } = await ctx.params;
    const body = await readJson(req, studentPatchSchema);
    if (Object.keys(body).length === 0) throw new ApiError(400, "empty_body", "Nothing to update.");
    const [updated] = await db
      .update(students)
      .set({
        ...(body.fullName ? { fullName: body.fullName } : {}),
        ...(body.email !== undefined ? { email: body.email || null } : {}),
        ...(body.classLabel !== undefined ? { classLabel: body.classLabel || null } : {}),
        ...(body.status ? { status: body.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(students.id, id))
      .returning();
    if (!updated) throw new ApiError(404, "not_found", "Student not found.");
    await logAudit({
      userId: user.id,
      actorName: user.name,
      action: "student.update",
      entityType: "student",
      entityId: id,
      details: { status: updated.status, changes: Object.keys(body) },
      ip: clientIp(req),
    });
    return { ok: true, student: updated };
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return api(req, async () => {
    const user = await requireUser(["admin"]);
    const { id } = await ctx.params;
    const [attendances] = await db
      .select({ n: count() })
      .from(attendanceRecords)
      .where(eq(attendanceRecords.studentId, id));
    if ((attendances?.n ?? 0) > 0) {
      // Preserve the audit/attendance trail — archive instead of hard delete.
      const [archived] = await db
        .update(students)
        .set({ status: "archived", updatedAt: new Date() })
        .where(and(eq(students.id, id), sql`true`))
        .returning({ id: students.id });
      if (!archived) throw new ApiError(404, "not_found", "Student not found.");
      await logAudit({ userId: user.id, actorName: user.name, action: "student.archive", entityType: "student", entityId: id, ip: clientIp(req) });
      return { ok: true, archived: true, message: "Student archived (has attendance history); removed from live recognition." };
    }
    const [deleted] = await db.delete(students).where(eq(students.id, id)).returning({ id: students.id });
    if (!deleted) throw new ApiError(404, "not_found", "Student not found.");
    await logAudit({ userId: user.id, actorName: user.name, action: "student.delete", entityType: "student", entityId: id, ip: clientIp(req) });
    return { ok: true, archived: false };
  });
}
