import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { attendanceRecords, attendanceSessions, students, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ApiError, api, clientIp, readJson } from "@/lib/http";
import { sessionPatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return api(_req, async () => {
    await requireUser();
    const { id } = await ctx.params;
    const [session] = await db
      .select({ s: attendanceSessions, creator: users.name })
      .from(attendanceSessions)
      .leftJoin(users, eq(users.id, attendanceSessions.createdById))
      .where(eq(attendanceSessions.id, id))
      .limit(1);
    if (!session) throw new ApiError(404, "not_found", "Session not found.");

    const records = await db
      .select({
        id: attendanceRecords.id,
        studentId: attendanceRecords.studentId,
        fullName: students.fullName,
        enrollmentNo: students.enrollmentNo,
        classLabel: students.classLabel,
        method: attendanceRecords.method,
        confidence: attendanceRecords.confidence,
        matchedVia: attendanceRecords.matchedVia,
        livenessScore: attendanceRecords.livenessScore,
        recordedAt: attendanceRecords.recordedAt,
        recorder: sql<string | null>`${users.name}`,
      })
      .from(attendanceRecords)
      .innerJoin(students, eq(students.id, attendanceRecords.studentId))
      .leftJoin(users, eq(users.id, attendanceRecords.recordedById))
      .where(eq(attendanceRecords.sessionId, id))
      .orderBy(desc(attendanceRecords.recordedAt));

    const roster = await db
      .select({ id: students.id, fullName: students.fullName, enrollmentNo: students.enrollmentNo })
      .from(students)
      .where(
        session.s.classLabel
          ? and(eq(students.status, "active"), eq(students.classLabel, session.s.classLabel))
          : eq(students.status, "active"),
      )
      .orderBy(asc(students.fullName));

    return {
      ok: true,
      session: { ...session.s, creator: session.creator, recordCount: records.length },
      records,
      roster,
    };
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  return api(req, async () => {
    const user = await requireUser(["admin", "teacher"]);
    const { id } = await ctx.params;
    const body = await readJson(req, sessionPatchSchema);

    const [session] = await db.select().from(attendanceSessions).where(eq(attendanceSessions.id, id)).limit(1);
    if (!session) throw new ApiError(404, "not_found", "Session not found.");

    if (body.action === "close") {
      if (session.status === "closed") throw new ApiError(409, "already_closed", "Session is already closed.");
      const [updated] = await db
        .update(attendanceSessions)
        .set({ status: "closed", endedAt: new Date() })
        .where(eq(attendanceSessions.id, id))
        .returning();
      await logAudit({
        userId: user.id,
        actorName: user.name,
        action: "session.close",
        entityType: "session",
        entityId: id,
        details: { title: session.title },
        ip: clientIp(req),
      });
      return { ok: true, session: updated };
    }

    if (body.action === "reopen") {
      const clash = await db
        .select({ id: attendanceSessions.id })
        .from(attendanceSessions)
        .where(sql`${attendanceSessions.status} = 'open' and ${attendanceSessions.id} <> ${id} and coalesce(${attendanceSessions.classLabel}, '') = coalesce(${session.classLabel}, '')`)
        .limit(1);
      if (clash.length > 0) throw new ApiError(409, "session_open", "Another open session exists for this class.");
      const [updated] = await db
        .update(attendanceSessions)
        .set({ status: "open", endedAt: null })
        .where(eq(attendanceSessions.id, id))
        .returning();
      await logAudit({ userId: user.id, actorName: user.name, action: "session.reopen", entityType: "session", entityId: id, ip: clientIp(req) });
      return { ok: true, session: updated };
    }

    const [updated] = await db
      .update(attendanceSessions)
      .set({
        ...(body.title ? { title: body.title } : {}),
        ...(body.autoRecord !== undefined ? { autoRecord: body.autoRecord } : {}),
      })
      .where(eq(attendanceSessions.id, id))
      .returning();
    await logAudit({ userId: user.id, actorName: user.name, action: "session.update", entityType: "session", entityId: id, ip: clientIp(req) });
    return { ok: true, session: updated };
  });
}
