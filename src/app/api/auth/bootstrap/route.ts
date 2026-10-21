import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, hashPassword, validatePasswordStrength } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ApiError, api, clientIp, readJson } from "@/lib/http";
import { credentialsSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * One-time admin bootstrap: allowed ONLY while the users table is empty.
 * After the first account exists this route is permanently closed (410).
 */
export async function POST(req: Request) {
  return api(req, async () => {
    const existing = await db.select({ id: users.id }).from(users).limit(1);
    if (existing.length > 0) {
      throw new ApiError(410, "bootstrap_closed", "Admin account already exists. Sign in instead.");
    }
    const body = await readJson(req, credentialsSchema);
    const pwError = validatePasswordStrength(body.password);
    if (pwError) throw new ApiError(422, "weak_password", pwError);

    const email = body.email.toLowerCase();
    const dup = await db.select({ id: users.id }).from(users).limit(1); // cheap guard for races
    void dup;
    const inserted = await db
      .insert(users)
      .values({
        email,
        name: body.name,
        role: "admin",
        passwordHash: await hashPassword(body.password),
      })
      .onConflictDoNothing()
      .returning({ id: users.id });
    if (inserted.length === 0) throw new ApiError(409, "exists", "Could not create the admin account.");

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    await createSession(user!.id);
    await logAudit({
      userId: user!.id,
      actorName: user!.name,
      action: "auth.bootstrap_admin",
      entityType: "user",
      entityId: user!.id,
      ip: clientIp(req),
    });
    return { ok: true, user: { id: user!.id, name: user!.name, email: user!.email, role: user!.role } };
  });
}
