-- FaceWise V2 → V3 additive upgrade for an EXISTING Supabase PostgreSQL DB
-- (tables students / attendance_sessions / attendance_records are preserved;
-- nothing is dropped). Run in the Supabase SQL editor or psql, then delete
-- reliance on the browser-side direct Supabase writes (VITE_SUPABASE_ANON_KEY
-- clients should be retired once this app is the only writer).
--
-- Mapping notes for legacy rows: V2 attendance_records rows referenced students
-- by name/id only if you had them; adjust student_id backfill to your data.

BEGIN;

-- 1. New identity/authorization objects (same DDL as 0001 fresh install)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL, name text NOT NULL,
  role text NOT NULL DEFAULT 'teacher' CHECK (role IN ('admin','teacher')),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON users (lower(email));

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL, expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_sessions_token ON auth_sessions (token_hash);

CREATE TABLE IF NOT EXISTS face_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('sface128','lbph944')),
  vector jsonb NOT NULL,
  quality real NOT NULL CHECK (quality >= 0 AND quality <= 1),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_face_templates_student ON face_templates (student_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_name text, action text NOT NULL, entity_type text NOT NULL,
  entity_id text, details jsonb, ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Harden existing tables (all nullable/defaulted → existing rows untouched)
ALTER TABLE students       ADD COLUMN IF NOT EXISTS status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived'));
ALTER TABLE students       ADD COLUMN IF NOT EXISTS template_count integer NOT NULL DEFAULT 0;
ALTER TABLE students       ADD COLUMN IF NOT EXISTS template_kind  text;
ALTER TABLE students       ADD COLUMN IF NOT EXISTS enrolled_by    uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE students       ADD COLUMN IF NOT EXISTS updated_at     timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS uq_students_enrollment_lower ON students (lower(enrollment_no));

ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS auto_record boolean NOT NULL DEFAULT true;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS created_by  uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS method         text NOT NULL DEFAULT 'auto' CHECK (method IN ('auto','manual'));
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS matched_via    text CHECK (matched_via IS NULL OR matched_via IN ('sface','lbph','manual'));
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS liveness_score real;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS recorded_by    uuid REFERENCES users(id) ON DELETE SET NULL;

-- 3. THE critical fix: duplicate attendance prevention at the constraint level.
--    First collapse any pre-existing duplicates (keep the earliest row)…
DELETE FROM attendance_records a
 USING attendance_records b
 WHERE a.session_id = b.session_id
   AND a.student_id = b.student_id
   AND (a.recorded_at, a.id) > (b.recorded_at, b.id);

--    …then enforce uniqueness forever. If this fails, inspect the reported
--    rows — do NOT drop the statement; the constraint is the point.
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_session_student
  ON attendance_records (session_id, student_id);

COMMIT;
