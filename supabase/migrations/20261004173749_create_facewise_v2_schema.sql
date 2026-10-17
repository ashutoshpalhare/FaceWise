/*
# FaceWise V2 — Core Database Schema


## Overview
Creates three core tables for FaceWise V2:
- `students` — enrolled individuals
- `attendance_sessions` — each attendance-taking event
- `attendance_records` — recognized students within a session


## 1. New Tables


### `students`
- `id` (serial PK) — numeric ID used as LBPH label
- `enrollment_no` (text, unique) — enrollment number
- `name` (text, not null) — full name
- `email` (text) — contact email
- `department` (text) — department/class
- `image_count` (int, default 0) — training images captured
- `is_active` (boolean, default true)
- `created_at`, `updated_at` (timestamptz)


### `attendance_sessions`
- `id` (uuid PK)
- `subject` (text) — subject name
- `status` (text, default 'completed') — active|completed|cancelled
- `started_at`, `ended_at` (timestamptz)
- `duration_seconds` (int)
- `total_recognized` (int, default 0)
- `created_at` (timestamptz)


### `attendance_records`
- `id` (uuid PK)
- `session_id` (uuid FK → attendance_sessions CASCADE)
- `student_id` (int FK → students CASCADE)
- `confidence` (real) — LBPH confidence
- `recognized_at` (timestamptz)
- `date` (date), `time` (text)
- `created_at` (timestamptz)


## 2. Indexes
On session_id, student_id, date, subject, started_at, name, enrollment_no


## 3. Security
RLS on all tables. Single-tenant (no auth): TO anon, authenticated, USING(true)/WITH CHECK(true).
*/


-- ============================================================
-- students
-- ============================================================
CREATE TABLE IF NOT EXISTS students (
  id serial PRIMARY KEY,
  enrollment_no text UNIQUE NOT NULL,
  name text NOT NULL,
  email text,
  department text,
  image_count int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);


ALTER TABLE students ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS "anon_select_students" ON students;
CREATE POLICY "anon_select_students" ON students FOR SELECT
TO anon, authenticated USING (true);


DROP POLICY IF EXISTS "anon_insert_students" ON students;
CREATE POLICY "anon_insert_students" ON students FOR INSERT
TO anon, authenticated WITH CHECK (true);


DROP POLICY IF EXISTS "anon_update_students" ON students;
CREATE POLICY "anon_update_students" ON students FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);


DROP POLICY IF EXISTS "anon_delete_students" ON students;
CREATE POLICY "anon_delete_students" ON students FOR DELETE
TO anon, authenticated USING (true);


-- ============================================================
-- attendance_sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),