# FaceWise V3 — privacy-first face-recognition attendance

FaceWise registers students with quality-gated face captures, recognizes faces live in the
classroom, and persists attendance to **one authoritative PostgreSQL database** with
duplicate prevention, role-based access, and a full audit trail. Recognition runs
**on-device in the browser** — raw frames are processed and discarded; only compact
numeric descriptors are stored, in your own (self-hosted = private) database.

```
Browser (React client)                         Server (Next.js route handlers)        PostgreSQL (Drizzle ORM)
┌─────────────────────────────┐   HTTPS +     ┌──────────────────────────────┐      ┌────────────────────────────┐
│ getUserMedia camera         │   httpOnly    │ zod validation · RBAC       │      │ users · auth_sessions      │
│ SFace 128-d embeddings (CDN │   cookie      │ threshold re-validation       │────▶│ students · face_templates  │
│ model) or LBPH-944 fallback │──────────────▶│ UNIQUE(session,student)       │      │ attendance_sessions/records│
│ quality gates + liveness    │               │ audit log                     │      │ audit_logs                 │
└─────────────────────────────┘               └──────────────────────────────┘      └────────────────────────────┘
```

## What changed vs. V2 (`V3-by-AP` audit findings)

The audited V2 branch (`python-engine/engine.py` + Vite/Supabase frontend) had these
**real defects**, all fixed here:

| # | V2 finding | V3 fix |
|---|-----------|--------|
| 1 | Two sources of truth: `StudentDetails/studentdetails.csv` + Supabase, rewritten whole-file (race/prone to loss) | Single PostgreSQL store; CSV only as *import/export format* with strict validation |
| 2 | No authentication at all; Flask bound `0.0.0.0:5000` with wildcard CORS; Supabase anon key in browser writing records | Server-side sessions (httpOnly SameSite cookie), bcrypt (cost 12), login rate limiting, role checks on **every** API route, no client DB access |
| 3 | Duplicate prevention = in-memory `recognized` set → vanished on restart | `UNIQUE(session_id, student_id)` database constraint + checked API response (409-safe) |
| 4 | LBPH distance ≤ 70 binary confidence, single-frame record | Two engines with **configurable accept/review bands**, look-alike margin check, N-of-M frame consensus, and server re-validation of every auto confidence |
| 5 | Camera as process-global singleton, leaked on error paths; `get_camera()` side-effect in status endpoint | One stream per page (`useCamera` hook): always stopped on unmount/tab-hide/error, explicit error taxonomy |
| 6 | 50 blind captures, no quality control | 50 *quality-gated* captures (brightness/sharpness/framing), only top-10 stored per student |
| 7 | Zero tests, no migrations, no `.env.example`, no Docker | 45 unit tests (vitest), forward-only SQL migrations, `.env.example`, Dockerfile + compose |
| 8 | No liveness concept at all | Passive motion-energy liveness gate (documented limits below) + review queue requiring human confirmation |

## Face recognition pipeline (V3)

1. **Primary engine — SFace embeddings (InsightFace family).** [`@vladmandic/face-api`](https://www.npmjs.com/package/@vladmandic/face-api)
   implements the SFace 128-d model (MIT-licensed weights; Tiny Face detector + 68-point
   landmarks ⇒ the recognizer performs affine **face alignment** before embedding).
   Loaded lazily from CDN in the browser — nothing heavy is bundled or served by the app,
   and inference is 100% client-side (WebGL). No GPU required; a laptop CPU/webgl does
   5–15 fps at 640×480 comfortably.
2. **Fallback engine — LBPH (preserved from V2, upgraded).** If the model/CDN is
   unavailable (air-gapped, blocked, old browser), the app computes a classic
   **uniform-LBP 59-bin × 4×4-grid = 944-dim histogram descriptor** (`src/lib/recognition/lbph.ts`)
   with histogram-intersection matching — the same algorithm family as
   `cv2.face.LBPHFaceRecognizer`, now with alignment crop, quality gating, thresholds and
   consensus that V2 lacked. The UI always shows which engine is active.
3. **Decision policy** (`similarity.ts`, unit-tested): three zones — `known` /
   `review` (shown, never auto-recorded; needs teacher confirmation) / `unknown`
   (never recorded). A near-tie with the runner-up (margin < 0.05/0.02) demotes to `review`
   to protect look-alike pairs. Auto-record requires identity **consensus across frames**
   (`RECOGNITION_FRAMES_REQUIRED`, default 2) plus the liveness gate.
4. **Server re-validation**: `/api/sessions/[id]/records` re-checks the session is open,
   `auto_record` is enabled, the student is active, `confidence ≥ accept threshold`, and the
   unique constraint makes duplicates impossible even across racing clients.

### Enrollment quality checks (`quality.ts`, unit-tested)
per capture: face crop ≥ 96 px, brightness in 38–225, Laplacian-variance sharpness ≥ 55,
edge-framing score; rejected frames show a human reason (“Too dark — add light”, …).
Target 50 accepted captures, minimum 12, top 10 by quality stored. Photo-file and
**manual (no-biometrics)** enrollment paths exist for environments without a camera.

### Liveness — what it is and is NOT
Passive motion-energy over the face ROI across the last frames (mean abs pixel change).
It **does** defeat a printed still photo held up to the camera (near-zero variance ⇒ blocked,
`recorded rows keep the liveness score for the audit trail`). It does **not** defeat a
video replayed on a phone screen or a 3D mask, and it is **not** ISO 30107-3 certified PAD.
Therefore: review-band matches always need a human, teachers can remove any record in one
click (audited), and attendance remains an *advisory* workflow — never a security boundary.
If you need certified anti-spoofing, integrate a dedicated vendor model (e.g. InsightFace
anti-spoof, or commercial iBeta-certified SDKs) behind `/api/sessions/[id]/records`.

## Setup & run

```bash
cp .env.example .env            # set DATABASE_URL (+ APP_SECRET in production)
npm ci
npx drizzle-kit push            # apply schema (src/db/schema.ts) to your database
npm run dev                     # http://localhost:3000
```

First run: with **zero users** the app shows a one-time “create administrator” screen
(`POST /api/auth/bootstrap`); it closes permanently (410) after the first account exists.

Tests: `npx vitest run` (45 unit tests for matching math, LBPH descriptors, quality gates,
liveness, CSV validation, API schemas). Typecheck: `npx tsc --noEmit`. Build: `npm run build`.

**Verified results (this repository state, live server + real PostgreSQL):**
- `npx vitest run` → **45 / 45 unit tests pass** (6 files).
- `npx next typegen`, `tsc --noEmit`, `next build` → clean.
- `node scripts/e2e.mjs` (in-repo) → **38 / 38 end-to-end API checks pass**: unauthenticated 401s,
  one-shot admin bootstrap (410 afterwards), bcrypt login + wrong-password 401, teacher-vs-admin
  RBAC (403), enrollment with dimension-validated templates, duplicate enrollment 409, session
  lifecycle, **duplicate auto-record collapsed by the DB UNIQUE constraint**, below-threshold
  auto-record rejected server-side (422), manual override, closed-session writes 409, percentage
  report, CSV export stream, bulk import dry-run/commit/re-import-skip, audit contents,
  descriptor-only privacy check, archive-preserves-history.
- A unit-test bug the suite exposed and fixed during this upgrade: `histogramIntersection`
  now L1-normalizes internally, so multi-cell LBPH histograms (total mass 16) compare correctly
  — same identity scored 1.000 vs 0.948 for different identities on synthetic faces.

### Database / migrations
- Fresh install: `migrations/0001_facewise_v3_fresh.sql` (or `drizzle-kit push`).
- Upgrading an existing V2 Supabase DB (attendance tables preserved, additive only):
  `migrations/0002_facewise_v2_upgrade.sql` — includes duplicate-cleanup + the unique index.
- **Retire direct browser→Supabase writes** after upgrading (remove anon-key usage from the
  V2 frontend; revoke any public write policies). This app never uses a service-role key —
  there is no Supabase client at all; DB access is server-side only.

### Docker
```bash
POSTGRES_PASSWORD=... APP_SECRET=$(openssl rand -hex 32) docker compose up --build
# → app on :3000, Postgres volume `facewise-data`. Put TLS in front (camera needs HTTPS).
```

## Roles & endpoints (all server-enforced)

| Role | Can |
|------|-----|
| teacher | enroll students, run sessions, record/correct attendance, view reports |
| admin | everything above + manage users, view audit log, delete students |

`/api/auth/*` (status·bootstrap·login·logout·me) · `/api/students` (+`[id]`, `import`) ·
`/api/templates` · `/api/sessions` (+`[id]`, `[id]/records`) · `/api/reports/attendance`
(`?format=csv` export) · `/api/audit` · `/api/config` (public policy values) · `/api/health`.

## Troubleshooting

- **Camera never starts** — browsers only allow camera on `https://` or `http://localhost`,
  and in iframes only with `allow="camera"` (embed FaceWise with
  `<iframe src=... allow="camera; microphone">`). Permission must be granted per origin.
- **“LBPH fallback active” badge** — the CDN for SFace models was unreachable (offline, proxy,
  ad-block). Recognition still works with lower robustness; download the `model/` folder from
  the `@vladmandic/face-api` npm package, serve it internally, and set `FACE_API_MODEL_URL`.
- **`409 session_open`** — one open session per class by design; close it (Sessions page or
  `PATCH {action:"close"}`).
- **`409 duplicate / already recorded`** — the DB constraint did its job; the UI treats this
  as “already present”, not an error.
- **`422 confidence_too_low`** — client matched but under the server threshold: the student
  lands in “Needs confirmation” instead of being auto-recorded. Raise/lower
  `SFACE_MIN_SIMILARITY` deliberately, per your lighting conditions.
- **`503 db_unreachable`** — DATABASE_URL wrong or Postgres down; every route degrades to
  structured JSON errors, the UI shows retry banners.

## Known limitations (honest list)

- SFace-mode **accuracy on a real class has not been benchmarked here** (no camera/webgl in
  CI). Fallback LBPH matching logic *is* unit-tested; expect it to work only for cooperative
  frontal faces with decent light. Validate on your hardware before relying on auto-attendance.
- Liveness = passive motion heuristic; see section above. Not anti-spoofing certified.
- face-api models load from a CDN by default (set `FACE_API_MODEL_URL` for air-gapped).
- TFJS in-browser inference is slower on very old integrated GPUs; the loop degrades in fps,
  not in correctness (consensus absorbs it).
- Photo-file enrollment inherits whatever the detector can see in a *static* image — no
  liveness is possible in that path; those templates are marked as normal templates and the
  operator is responsible for provenance.
- Sessions are per-class; no multi-camera parallel streaming (single operator model, like V2).

## Privacy stance

No raw images, no photos, no “cloud training”. The browser turns pixels into 128/944-float
descriptors; the database stores descriptors, names/roll numbers and attendance facts. Deleting
a student cascades their templates. There is no analytics, no external API calls except the
optional model-CDN fetch (configurable/lockable), and all audit rows record *who did what*,
never biometric payloads.
