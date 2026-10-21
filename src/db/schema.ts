import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * FaceWise V3 — authoritative single source of truth.
 *
 * The V2 branch kept student identities in `StudentDetails/studentdetails.csv`
 * while attendance went to Supabase, which produced drift and lost records on
 * restart. V3 collapses identity, templates, sessions, records and audit into
 * this one PostgreSQL database (self-hosted = "local" for privacy).
 */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role", { enum: ["admin", "teacher"] }).notNull().default("teacher"),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_users_email_lower").on(sql`lower(${t.email})`)],
);

/** Server-side session tokens. Only the SHA-256 hash of the cookie token is stored. */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_auth_sessions_token").on(t.tokenHash), index("idx_auth_sessions_user").on(t.userId)],
);

export const students = pgTable(
  "students",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    enrollmentNo: text("enrollment_no").notNull(),
    email: text("email"),
    classLabel: text("class_label"),
    /** archived students stay for attendance history but are excluded from live recognition. */
    status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
    /** number of stored face templates (0 = registered without biometrics, manual-only). */
    templateCount: integer("template_count").notNull().default(0),
    /** which engine produced the templates: 'sface' (embedding) or 'lbph' (fallback). */
    templateKind: text("template_kind"),
    enrolledById: uuid("enrolled_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_students_enrollment_lower").on(sql`lower(${t.enrollmentNo})`),
    uniqueIndex("uq_students_name_enrollment").on(sql`lower(${t.fullName})`, sql`lower(${t.enrollmentNo})`),
    index("idx_students_full_name").on(t.fullName),
  ],
);

/**
 * Face templates. 128-d SFace embeddings (InsightFace-family, computed in the
 * browser) or 944-d LBPH histogram descriptors. Raw enrollment images are
 * processed locally and NEVER uploaded; only compact descriptors are persisted.
 */
export const faceTemplates = pgTable(
  "face_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["sface128", "lbph944"] }).notNull(),
    vector: jsonb("vector").notNull(),
    quality: real("quality").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_face_templates_student").on(t.studentId), index("idx_face_templates_kind").on(t.kind)],
);

export const attendanceSessions = pgTable(
  "attendance_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    classLabel: text("class_label"),
    status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    autoRecord: boolean("auto_record").notNull().default(true),
    createdById: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("idx_attendance_sessions_status").on(t.status)],
);

/**
 * Attendance facts — the single authoritative record.
 * UNIQUE(session_id, student_id) enforces duplicate prevention at the database
 * level (V2 relied on an in-memory set that vanished on restart).
 */
export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => attendanceSessions.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    method: text("method", { enum: ["auto", "manual"] }).notNull().default("auto"),
    confidence: real("confidence"),
    matchedVia: text("matched_via", { enum: ["sface", "lbph", "manual"] }),
    livenessScore: real("liveness_score"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    recordedById: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("uq_attendance_session_student").on(t.sessionId, t.studentId),
    index("idx_attendance_records_student").on(t.studentId),
    index("idx_attendance_records_session").on(t.sessionId),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    actorName: text("actor_name"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    details: jsonb("details"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_audit_created").on(t.createdAt), index("idx_audit_entity").on(t.entityType, t.entityId)],
);

export type User = typeof users.$inferSelect;
export type Student = typeof students.$inferSelect;
export type FaceTemplateRow = typeof faceTemplates.$inferSelect;
export type AttendanceSession = typeof attendanceSessions.$inferSelect;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
