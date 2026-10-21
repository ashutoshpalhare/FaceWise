import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { faceTemplates, students } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { api } from "@/lib/http";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * The roster bundle the browser matches against. Only compact descriptors are
 * transferred (no images), auth required, active students only, top-quality
 * templates per student capped to keep the payload lean.
 */
export async function GET() {
  return api(undefined as unknown as Request, async () => {
    await requireUser(["admin", "teacher"]);
    const roster = await db
      .select({ id: students.id, fullName: students.fullName, enrollmentNo: students.enrollmentNo, kind: students.templateKind })
      .from(students)
      .where(eq(students.status, "active"));

    const templates = await db
      .select({
        studentId: faceTemplates.studentId,
        kind: faceTemplates.kind,
        vector: faceTemplates.vector,
        quality: faceTemplates.quality,
      })
      .from(faceTemplates)
      .orderBy(desc(faceTemplates.quality))
      .limit(20000);

    const byStudent = new Map<string, Array<{ kind: string; vector: number[]; quality: number }>>();
    for (const t of templates) {
      const list = byStudent.get(t.studentId) ?? [];
      if (list.length >= config.enrollStoreTopTemplates) continue;
      list.push({ kind: t.kind, vector: (t.vector as number[]) ?? [], quality: t.quality });
      byStudent.set(t.studentId, list);
    }

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      students: roster
        .map((s) => ({ ...s, templates: byStudent.get(s.id) ?? [] }))
        .filter((s) => s.templates.length > 0),
    };
  });
}
