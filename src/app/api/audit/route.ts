import { desc } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { api } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Admin-only audit trail viewer. */
export async function GET(req: Request) {
  return api(req, async () => {
    await requireUser(["admin"]);
    const limit = Math.min(200, Math.max(10, Number(new URL(req.url).searchParams.get("limit") ?? 50)));
    const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
    return { ok: true, logs: rows };
  });
}
