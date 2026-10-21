import { logAudit } from "@/lib/audit";
import { destroySession, getCurrentUser } from "@/lib/auth";
import { api } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST() {
  return api(undefined as unknown as Request, async () => {
    const user = await getCurrentUser();
    await destroySession();
    if (user) await logAudit({ userId: user.id, actorName: user.name, action: "auth.logout", entityType: "user", entityId: user.id });
    return { ok: true };
  });
}
