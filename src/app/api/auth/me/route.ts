import { getCurrentUser } from "@/lib/auth";
import { api } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return api(undefined as unknown as Request, async () => {
    const user = await getCurrentUser();
    if (!user) return { ok: true, user: null };
    return { ok: true, user };
  });
}
