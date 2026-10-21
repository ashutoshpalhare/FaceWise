import { count } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { api } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Unauthenticated bootstrap state probe (returns no PII). */
export async function GET() {
  return api(undefined as unknown as Request, async () => {
    const rows = await db.select({ n: count() }).from(users);
    const userCount = rows[0]?.n ?? 0;
    return { ok: true, needsBootstrap: userCount === 0, userCount };
  });
}
