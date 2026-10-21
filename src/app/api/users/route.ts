import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, requireUser, validatePasswordStrength } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ApiError, api, clientIp, readJson } from "@/lib/http";
import { userCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  return api(undefined as unknown as Request, async () => {
    await requireUser(["admin"]);
    const rows = await db
      .select({ id: users.id, email: users.email, name: users.name, role: users.role, createdAt: users.createdAt })
      .from(users)
      .orderBy(asc(users.name));
    return { ok: true, users: rows };
  });
}

export async function POST(req: Request) {
  return api(req, async () => {
    const actor = await requireUser(["admin"]);
    const body = await readJson(req, userCreateSchema);
    const pwError = validatePasswordStrength(body.password);
    if (pwError) throw new ApiError(422, "weak_password", pwError);
    const email = body.email.toLowerCase();
    const dup = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (dup.length > 0) throw new ApiError(409, "duplicate_email", "A user with that email already exists.");
    const [created] = await db
      .insert(users)
      .values({ email, name: body.name, role: body.role, passwordHash: await hashPassword(body.password) })
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role });
    await logAudit({
      userId: actor.id,
      actorName: actor.name,
      action: "user.create",
      entityType: "user",
      entityId: created!.id,
      details: { role: created!.role, email: created!.email },
      ip: clientIp(req),
    });
    return { ok: true, user: created };
  });
}


