-- FaceWise V3 — fresh installation schema (PostgreSQL / Supabase SQL editor)
-- Equivalent to `npx drizzle-kit push` against src/db/schema.ts.
-- NOTE: for upgrading an existing V2 Supabase DB use facewise_v2_upgrade.sql instead.

BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL,
  name           text NOT NULL,
  role           text NOT NULL DEFAULT 'teacher' CHECK (role IN ('admin','teacher')),
  password_hash  text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON users (lower(email));

CREATE TABLE IF NOT EXISTS auth_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_sessions_token ON auth_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions (user_id);

CREATE TABLE IF NOT EXISTS students (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name      text NOT NULL,
  enrollment_no  text NOT NULL,
  email          text,
  class_label    text,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  template_count integer NOT NULL DEFAULT 0,
  template_kind  text CHECK (template_kind IN ('sface128','lbph944')),
  enrolled_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_students_enrollment_lower ON students (lower(enrollment_no));
CREATE UNIQUE INDEX IF NOT EXISTS uq_students_name_enrollment ON students (lower(full_name), lower(enrollment_no));
CREATE INDEX IF NOT EXISTS idx_students_full_name ON students (full_name);

-- Compact biometric descriptors ONLY. Raw enrollment images never leave the
-- browser; there is intentionally no image blob column in this database.
CREATE TABLE IF NOT EXISTS face_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('sface128','lbph944')),
  vector      jsonb NOT NULL,
  quality     real NOT NULL CHECK (quality >= 0 AND quality <= 1),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_face_templates_student ON face_templates (student_id);
CREATE INDEX IF NOT EXISTS idx_face_templates_kind ON face_templates (kind);

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  class_label text,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,
  auto_record boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_status ON attendance_sessions (status);

CREATE TABLE IF NOT EXISTS attendance_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  method        text NOT NULL DEFAULT 'auto' CHECK (method IN ('auto','manual')),
  confidence    real CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  matched_via   text CHECK (matched_via IS NULL OR matched_via IN ('sface','lbph','manual')),
  liveness_score real CHECK (liveness_score IS NULL OR (liveness_score >= 0 AND liveness_score <= 1)),
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  recorded_by   uuid REFERENCES users(id) ON DELETE SET NULL
);
-- THE duplicate-attendance guarantee (V2 had only a restart-lost memory set):
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_session_student
  ON attendance_records (session_id, student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student ON attendance_records (student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_session ON attendance_records (session_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_name  text,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   text,
  details     jsonb,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs (entity_type, entity_id);

COMMIT;
