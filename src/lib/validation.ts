import { z } from "zod";

export const vectorSchema = (kind: "sface128" | "lbph944") =>
  z
    .array(z.number().finite())
    .length(kind === "sface128" ? 128 : 944, `${kind} vector must have exact dimension`);

export const templateInputSchema = z.object({
  kind: z.enum(["sface128", "lbph944"]),
  vector: z.array(z.number().finite()).min(1),
  quality: z.number().min(0).max(1),
});

export const studentCreateSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  enrollmentNo: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._-]{3,32}$/, "3-32 chars: letters, digits, . _ -"),
  email: z.union([z.string().trim().email(), z.literal(""), z.null()]).optional(),
  classLabel: z.string().trim().max(40).nullable().optional(),
  templates: z.array(templateInputSchema).max(60).default([]),
});

export const studentPatchSchema = z.object({
  fullName: z.string().trim().min(2).max(80).optional(),
  email: z.union([z.string().trim().email(), z.literal(""), z.null()]).optional(),
  classLabel: z.string().trim().max(40).nullable().optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export const csvImportSchema = z.object({
  csv: z.string().min(4).max(1_500_000),
  /** dry-run validates without writing; default true so UI can preview */
  dryRun: z.boolean().default(true),
});

export const sessionCreateSchema = z.object({
  title: z.string().trim().min(3).max(120),
  classLabel: z.string().trim().max(40).nullable().optional(),
  autoRecord: z.boolean().default(true),
});

export const sessionPatchSchema = z.object({
  action: z.enum(["close", "reopen", "update"]),
  title: z.string().trim().min(3).max(120).optional(),
  autoRecord: z.boolean().optional(),
});

export const attendanceRecordSchema = z.object({
  studentId: z.string().uuid(),
  method: z.enum(["auto", "manual"]),
  confidence: z.number().min(0).max(1).nullable().optional(),
  matchedVia: z.enum(["sface", "lbph", "manual"]).nullable().optional(),
  livenessScore: z.number().min(0).max(1).nullable().optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().min(3).max(160),
  password: z.string().min(1).max(200),
});

export const credentialsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  password: z.string().min(10).max(200),
});

export const userCreateSchema = credentialsSchema.extend({
  role: z.enum(["admin", "teacher"]),
});

export const userPatchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  role: z.enum(["admin", "teacher"]).optional(),
  password: z.string().min(10).max(200).optional(),
});
