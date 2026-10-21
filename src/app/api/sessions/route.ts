import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { attendanceRecords, attendanceSessions, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ApiError, api, clientIp, readJson } from "@/lib/http";
import { sessionCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  return api(undefined as unknown as Request, async () => {
    await requireUser();
    const rows = await db
      .select({
        id: attendanceSessions.id,
        title: attendanceSessions.title,
        classLabel: attendanceSessions.classLabel,
        status: attendanceSessions.status,
        autoRecord: attendanceSessions.autoRecord,
        startedAt: attendanceSessions.startedAt,
        endedAt: attendanceSessions.endedAt,
        createdBy: users.name,
        recordCount: sql<number>`(select count(*)::int from attendance_records ar where ar.session_id = ${attendanceSessions.id})`,
      })
      .from(attendanceSessions)
      .leftJoin(users, eq(users.id, attendanceSessions.createdById))
      .orderBy(desc(attendanceSessions.startedAt))
      .limit(200);
    return { ok: true, sessions: rows };
  });
}

export async function POST(req: Request) {
  return api(req, async () => {
    const user = await requireUser(["admin", "teacher"]);
    const body = await readJson(req, sessionCreateSchema);

    // One open session per class at a time (V2's global single-session model,
    // enforced in the DB layer instead of process memory).
    const openForClass = await db
      .select({ id: attendanceSessions.id })
      .from(attendanceSessions)
      .where(sql`${attendanceSessions.status} = 'open' and coalesce(${attendanceSessions.classLabel}, '') = coalesce(${body.classLabel ?? ""}, '')`)
      .limit(1);
    if (openForClass.length > 0) {
      throw new ApiError(409, "session_open", "An open session already exists for this class. Close it first.");
    }

    const [session] = await db
      .insert(attendanceSessions)
      .values({
        title: body.title,
        classLabel: body.classLabel || null,
        autoRecord: body.autoRecord,
        createdById: user.id,
      })
      .returning();

    await logAudit({
      userId: user.id,
      actorName: user.name,
      action: "session.open",
      entityType: "session",
      entityId: session!.id,
      details: { title: session!.title, classLabel: session!.classLabel },
      ip: clientIp(req),
    });
    return { ok: true, session: { ...session!, recordCount: 0 } };
  });
}
