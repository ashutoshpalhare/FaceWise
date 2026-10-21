import { db } from "@/db";
import { sql } from "drizzle-orm";
import { config } from "@/lib/config";
import { api } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Liveness endpoint for Docker/compose and ops dashboards. No auth, no PII. */
export async function GET() {
  return api(undefined as unknown as Request, async () => {
    try {
      await db.execute(sql`select 1`);
    } catch {
      return Response.json({ ok: false, db: "unreachable" }, { status: 503 });
    }
    return {
      ok: true,
      service: "facewise",
      version: "3.0.0",
      engine: {
        primary: "sface128 (InsightFace-family, on-device)",
        fallback: "lbph944 (histogram)",
        acceptThresholds: config.thresholds,
        enrollTargetCaptures: config.enrollTargetCaptures,
      },
    };
  });
}
