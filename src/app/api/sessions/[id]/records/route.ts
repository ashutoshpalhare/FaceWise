import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { attendanceRecords, attendanceSessions, students } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ApiError, api, clientIp, readJson } from "@/lib/http";
import { config } from "@/lib/config";
import { isConfidenceAcceptable } from "@/lib/recognition/similarity";
import { attendanceRecordSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Record attendance. THE authoritative write path — V2 synced CSV files into
 * Supabase from the browser; here a single endpoint enforces:
 *  1. session exists and is open
 *  2. auto matches must clear the server-side confidence threshold (client
 *     thresholds can be tampered with; the DB is the arbiter)
 *  3. duplicate prevention via UNIQUE(session, student) — checked, then
 *     enforced by the constraint for racing writers (409 response)
 */
export async function POST(req: Request, ctx: Ctx) {
  return api(req, async () => {
    const user = await requireUser(["admin", "teacher"]);
    const { id: sessionId } = await ctx.params;
    const body = await readJson(req, attendanceRecordSchema);

    const [session] = await db.select().from(attendanceSessions).where(eq(attendanceSessions.id, sessionId)).limit(1);
    if (!session) throw new ApiError(404, "not_found", "Session not found.");
    if (session.status !== "open") throw new ApiError(409, "session_closed", "Session is closed; attendance can no longer be recorded.");
    if (body.method === "auto" && !session.autoRecord) {
      throw new ApiError(409, "auto_disabled", "Auto-recording is disabled for this session. Use manual entry.");
    }

    const [student] = await db.select({ id: students.id, status: students.status }).from(students).where(eq(students.id, body.studentId)).limit(1);
    if (!student) throw new ApiError(404, "no_student", "Student not found.");
    if (student.status !== "active") throw new ApiError(409, "archived", "Student is archived and cannot be recorded.");

    if (body.method === "auto") {
      const kind = body.matchedVia === "lbph" ? "lbph944" : "sface128";
      const ok = isConfidenceAcceptable(kind, config.thresholds[kind === "sface128" ? "sface" : "lbph"], body.confidence);
      if (!ok) {
        throw new ApiError(422, "confidence_too_low", `Auto match confidence ${body.confidence ?? "missing"} is below the server threshold ${config.thresholds[kind === "sface128" ? "sface" : "lbph"].accept}. Record manually if the person is verified.`);
      }
    }

    const existing = await db
      .select({ id: attendanceRecords.id })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.sessionId, sessionId), eq(attendanceRecords.studentId, body.studentId)))
      .limit(1);
    if (existing.length > 0) {
      return { ok: true, duplicate: true, message: "Attendance already recorded for this student in this session." };
    }

    try {
      const [record] = await db
        .insert(attendanceRecords)
        .values({
          sessionId,
          studentId: body.studentId,
          method: body.method,
          confidence: body.confidence ?? null,
          matchedVia: body.matchedVia ?? (body.method === "manual" ? "manual" : null),
          livenessScore: body.livenessScore ?? null,
          recordedById: user.id,
        })
        .returning();
      await logAudit({
        userId: user.id,
        actorName: user.name,
        action: `attendance.${body.method}`,
        entityType: "attendance_record",
        entityId: record!.id,
        details: { sessionId, studentId: body.studentId, confidence: body.confidence ?? null },
        ip: clientIp(req),
      });
      return { ok: true, duplicate: false, record };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("uq_attendance_session_student") || msg.includes("duplicate key")) {
        return { ok: true, duplicate: true, message: "Attendance already recorded for this student in this session (race)." };
      }
      throw err;
    }
  });
}

/** Manual correction: remove a record (e.g. false auto-match). Audited. */
export async function DELETE(req: Request, ctx: Ctx) {
  return api(req, async () => {
    const user = await requireUser(["admin", "teacher"]);
    const { id: sessionId } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const studentId = typeof body?.studentId === "string" ? body.studentId : null;
    if (!studentId) throw new ApiError(400, "student_required", "studentId is required.");

    const [session] = await db.select().from(attendanceSessions).where(eq(attendanceSessions.id, sessionId)).limit(1);
    if (!session) throw new ApiError(404, "not_found", "Session not found.");

    const [deleted] = await db
      .delete(attendanceRecords)
      .where(and(eq(attendanceRecords.sessionId, sessionId), eq(attendanceRecords.studentId, studentId)))
      .returning({ id: attendanceRecords.id });
    if (!deleted) throw new ApiError(404, "not_recorded", "No attendance record found for that student in this session.");
    await logAudit({
      userId: user.id,
      actorName: user.name,
      action: "attendance.remove",
      entityType: "attendance_record",
      entityId: deleted.id,
      details: { sessionId, studentId },
      ip: clientIp(req),
    });
    return { ok: true };
  });
}
