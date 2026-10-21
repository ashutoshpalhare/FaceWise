import { api } from "@/lib/http";
import { publicConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Public runtime configuration for the browser (thresholds, capture policy). */
export async function GET() {
  return api(undefined as unknown as Request, async () => ({ ok: true, ...publicConfig }));
}
