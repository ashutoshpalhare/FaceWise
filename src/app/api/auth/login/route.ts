import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ApiError, api, clientIp, consumeRateLimit, readJson, resetRateLimit } from "@/lib/http";
import { loginSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return api(req, async () => {
    const body = await readJson(req, loginSchema);
    const email = body.email.toLowerCase();
    const ip = clientIp(req);
    const rateKey = `${ip}:${email}`;
    consumeRateLimit(rateKey);

    const rows = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
    const user = rows[0];
    const ok = user ? await verifyPassword(body.password, user.passwordHash) : false;
    if (!user || !ok) {
      await logAudit({ action: "auth.login_failed", entityType: "user", details: { email }, ip });
      throw new ApiError(401, "invalid_credentials", "Email or password is incorrect.");
    }
    resetRateLimit(rateKey);
    await createSession(user.id);
    await logAudit({ userId: user.id, actorName: user.name, action: "auth.login", entityType: "user", entityId: user.id, ip });
    return { ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
  });
}
