import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { attendanceRecords, attendanceSessions, students } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { api } from "@/lib/http";
import { toCsv } from "@/lib/recognition/csv";

export const dynamic = "force-dynamic";

/**
 * Attendance-percentage report (a feature V2 lacked entirely).
 * GET /api/reports/attendance?classLabel=CS-A&format=csv
 */
export async function GET(req: Request) {
  return api(req, async () => {
    await requireUser();
    const url = new URL(req.url);
    const classLabel = url.searchParams.get("classLabel");
    const format = url.searchParams.get("format") ?? "json";
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const sessionWhere = sql`true`;
    const sessions = await db
      .select({
        id: attendanceSessions.id,
        title: attendanceSessions.title,
        classLabel: attendanceSessions.classLabel,
        status: attendanceSessions.status,
        startedAt: attendanceSessions.startedAt,
        endedAt: attendanceSessions.endedAt,
        recordCount: sql<number>`(select count(*)::int from attendance_records ar where ar.session_id = ${attendanceSessions.id})`,
      })
      .from(attendanceSessions)
      .where(
        sql`${sessionWhere}
          ${classLabel ? sql`and (${attendanceSessions.classLabel} = ${classLabel} or ${attendanceSessions.classLabel} is null)` : sql``}
          ${from ? sql`and ${attendanceSessions.startedAt} >= ${new Date(from)}` : sql``}
          ${to ? sql`and ${attendanceSessions.startedAt} <= ${new Date(to)}` : sql``}`,
      )
      .orderBy(desc(attendanceSessions.startedAt));

    if (sessions.length === 0) {
      const empty = {
        ok: true,
        sessions: [],
        rows: [],
        overall: { sessions: 0, students: 0, avgPercentage: 0, deficientCount: 0 },
      };
      if (format === "csv") return csvResponse(empty);
      return empty;
    }

    const sessionIds = sessions.map((s) => s.id);
    const roster = classLabel
      ? await db.select().from(students).where(sql`${students.status} = 'active' and ${students.classLabel} = ${classLabel}`)
      : await db.select().from(students).where(eq(students.status, "active"));

    const records = await db
      .select({ sessionId: attendanceRecords.sessionId, studentId: attendanceRecords.studentId })
      .from(attendanceRecords)
      .where(sql`${attendanceRecords.sessionId} in (${sql.join(sessionIds.map((id) => sql`${id}`), sql`, `)})`);

    const attended = new Map<string, number>();
    for (const r of records) attended.set(r.studentId, (attended.get(r.studentId) ?? 0) + 1);

    const rows = roster
      .map((s) => {
        const a = attended.get(s.id) ?? 0;
        const total = sessions.length;
        return {
          studentId: s.id,
          fullName: s.fullName,
          enrollmentNo: s.enrollmentNo,
          classLabel: s.classLabel,
          attended: a,
          total,
          percentage: total > 0 ? Math.round((a / total) * 1000) / 10 : 0,
          deficient: total > 0 && a / total < 0.75,
        };
      })
      .sort((x, y) => y.percentage - x.percentage);

    const overall = {
      sessions: sessions.length,
      students: rows.length,
      avgPercentage: rows.length ? Math.round((rows.reduce((acc, r) => acc + r.percentage, 0) / rows.length) * 10) / 10 : 0,
      deficientCount: rows.filter((r) => r.deficient).length,
    };

    const payload = {
      ok: true,
      overall,
      sessions: sessions.map((s) => ({ id: s.id, title: s.title, classLabel: s.classLabel, status: s.status, startedAt: s.startedAt, recordCount: s.recordCount })),
      rows,
    };
    if (format === "csv") return csvResponse(payload);
    return payload;
  });
}

function csvResponse(payload: {
  overall: { sessions: number; students: number; avgPercentage: number; deficientCount: number };
  rows: Array<{ fullName: string; enrollmentNo: string; classLabel: string | null; attended: number; total: number; percentage: number }>;
}) {
  void payload.overall;
  const body = toCsv(
    ["name", "enrollment_no", "class", "present", "sessions", "percentage"],
    payload.rows.map((r) => [r.fullName, r.enrollmentNo, r.classLabel ?? "", r.attended, r.total, r.percentage]),
  );
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="facewise-attendance-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}


