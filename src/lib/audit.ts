import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export interface AuditEvent {
  userId?: string | null;
  actorName?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
}

/** Fire-and-log helper: writes never throw into the user flow. */
export async function logAudit(event: AuditEvent): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId: event.userId ?? null,
      actorName: event.actorName ?? null,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      details: event.details ?? null,
      ip: event.ip ?? null,
    });
  } catch (err) {
    console.error("[facewise] audit write failed:", err instanceof Error ? err.message : err);
  }
}
