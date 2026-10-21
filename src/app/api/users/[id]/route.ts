import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, requireUser, validatePasswordStrength } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ApiError, api, clientIp, readJson } from "@/lib/http";
import { userPatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function adminCount(): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(users)
    .where(eq(users.role, "admin"));
  return rows[0]?.n ?? 0;
}

export async function PATCH(req: Request, ctx: Ctx) {
  return api(req, async () => {
    const actor = await requireUser(["admin"]);
    const { id } = await ctx.params;
    const body = await readJson(req, userPatchSchema);

    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) throw new ApiError(404, "not_found", "User not found.");

    const patch: Partial<{ name: string; role: "admin" | "teacher"; passwordHash: string }> = {};
    if (body.name) patch.name = body.name;
    if (body.role && body.role !== target.role) {
      if (target.role === "admin" && body.role === "teacher") {
        // adminCount includes this user; at least one other admin must remain.
        const remaining = (await adminCount()) - 1;
        if (remaining <= 0) {
          throw new ApiError(409, "last_admin", "Cannot demote the last administrator.");
        }
      }
      patch.role = body.role;
    }
    if (body.password) {
      const pwError = validatePasswordStrength(body.password);
      if (pwError) throw new ApiError(422, "weak_password", pwError);
      patch.passwordHash = await hashPassword(body.password);
    }
    if (Object.keys(patch).length === 0) throw new ApiError(400, "empty", "Nothing to update.");

    const [updated] = await db
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning({ id: users.id, name: users.name, email: users.email, role: users.role });

    await logAudit({
      userId: actor.id,
      actorName: actor.name,
      action: "user.update",
      entityType: "user",
      entityId: id,
      details: { fields: Object.keys(patch) },
      ip: clientIp(req),
    });
    return { ok: true, user: updated };
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  return api(req, async () => {
    const actor = await requireUser(["admin"]);
    const { id } = await ctx.params;
    if (actor.id === id) throw new ApiError(409, "self_delete", "You cannot delete your own account.");
    const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, id)).limit(1);
    if (!target) throw new ApiError(404, "not_found", "User not found.");
    if (target.role === "admin") {
      const rows = await db.select({ n: count() }).from(users).where(eq(users.role, "admin"));
      if ((rows[0]?.n ?? 0) <= 1) throw new ApiError(409, "last_admin", "Cannot delete the last administrator.");
    }
    // auth_sessions cascade with the user; nothing else references users.
    await db.delete(users).where(eq(users.id, id));
    await logAudit({
      userId: actor.id,
      actorName: actor.name,
      action: "user.delete",
      entityType: "user",
      entityId: id,
      ip: clientIp(req),
    });
    return { ok: true };
  });
}


