/**
 * FaceWise V3 end-to-end API verification against a RUNNING server.
 * Real HTTP calls, real PostgreSQL — no mocks. Run: node scripts/e2e.mjs [baseUrl]
 */
const BASE = process.argv[2] || "http://localhost:3000";

let results = [];
const check = (name, cond, extra = "") => {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`);
};

function makeJar() {
  let cookie = "";
  const req = async (path, { method = "GET", body } = {}) => {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const pair = c.split(";")[0];
      if (pair.startsWith("fw_session=")) cookie = pair;
      if (pair.includes("fw_session=;")) cookie = "";
    }
    const ct = res.headers.get("content-type") || "";
    const payload = ct.includes("json") ? await res.json().catch(() => null) : await res.text();
    return { status: res.status, json: payload, text: typeof payload === "string" ? payload : null, headers: res.headers };
  };
  return req;
}

const validVector = (n, salt) => Array.from({ length: n }, (_, i) => Number((((Math.sin(i * 12.9898 + salt) * 43758.5453) % 1) * 0.01).toFixed(5)));

(async () => {
  console.log(`\nFaceWise E2E against ${BASE}\n${"—".repeat(50)}`);

  // 0 · health
  const health = await makeJar()("/api/health");
  check("health ok + db reachable", health.status === 200 && health.json?.ok === true, `status=${health.status}`);
  if (!(health.status === 200 && health.json?.ok)) {
    console.log("Server/DB unreachable — aborting.", JSON.stringify(health.json));
    process.exit(1);
  }

  const anon = makeJar();

  // 1 · unauthenticated access must be blocked (server-side RBAC, not UI-only)
  const unauth = await anon("/api/students");
  check("GET /api/students without cookie → 401", unauth.status === 401);
  const unauthRec = await anon("/api/sessions", { method: "POST", body: { title: "sneaky session", autoRecord: true } });
  check("POST /api/sessions without cookie → 401", unauthRec.status === 401);

  // 2 · bootstrap / login as admin
  const admin = makeJar();
  const status = await admin("/api/auth/status");
  const creds = { name: "E2E Admin", email: "admin@facewise.test", password: "FaceWise!2026" };
  if (status.json?.needsBootstrap) {
    const boot = await admin("/api/auth/bootstrap", { method: "POST", body: creds });
    check("admin bootstrap (first-run) → 200 + admin role", boot.status === 200 && boot.json?.user?.role === "admin", `status=${boot.status}`);
  } else {
    const login = await admin("/api/auth/login", { method: "POST", body: { email: creds.email, password: creds.password } });
    check("admin login → 200", login.status === 200 && login.json?.user?.role === "admin", `status=${login.status}`);
  }
  const again = await admin("/api/auth/bootstrap", { method: "POST", body: creds });
  check("bootstrap closed after first admin → 410", again.status === 410, `status=${again.status}`);

  const me = await admin("/api/auth/me");
  check("GET /api/auth/me → admin identity", me.status === 200 && me.json?.user?.email === creds.email);

  const badPw = await anon("/api/auth/login", { method: "POST", body: { email: creds.email, password: "WrongPassword123" } });
  check("wrong password → 401", badPw.status === 401);

  // 3 · teacher user creation + RBAC role gates
  const stamp = Date.now().toString(36);
  const teacherEmail = `teacher.${stamp}@facewise.test`;
  const tCreate = await admin("/api/users", {
    method: "POST",
    body: { name: "E2E Teacher", email: teacherEmail, password: "Teach3rPass!x", role: "teacher" },
  });
  check("admin creates teacher user → 200", tCreate.status === 200 && tCreate.json?.user?.role === "teacher", `status=${tCreate.status}`);
  const teacher = makeJar();
  const tLogin = await teacher("/api/auth/login", { method: "POST", body: { email: teacherEmail, password: "Teach3rPass!x" } });
  check("teacher login → 200", tLogin.status === 200);
  const teacherAudit = await teacher("/api/audit?limit=10");
  check("teacher GET /api/audit → 403 (admin-only)", teacherAudit.status === 403);
  const teacherUsers = await teacher("/api/users");
  check("teacher GET /api/users → 403", teacherUsers.status === 403);

  // 4 · enrollment + input validation
  const enrollmentA = `E2E-A-${stamp}`;
  const stuA = await admin("/api/students", {
    method: "POST",
    body: {
      fullName: `Asha Verma ${stamp}`,
      enrollmentNo: enrollmentA,
      email: "asha@example.com",
      classLabel: "E2E-Class",
      templates: [0, 1, 2].map((s) => ({ kind: "lbph944", vector: validVector(944, s + 1), quality: 0.8 - s * 0.1 })),
    },
  });
  check("student enroll w/ 3 LBPH templates → 200, templateCount=3", stuA.status === 200 && stuA.json?.student?.templateCount === 3, `status=${stuA.status} ${JSON.stringify(stuA.json?.error ?? "")}`);
  const studentAId = stuA.json?.student?.id;

  const dup = await admin("/api/students", { method: "POST", body: { fullName: `Other Name ${stamp}`, enrollmentNo: enrollmentA, templates: [] } });
  check("duplicate enrollment_no → 409", dup.status === 409, `status=${dup.status}`);

  const badEnroll = await admin("/api/students", { method: "POST", body: { fullName: "Valid Name", enrollmentNo: "has spaces!", templates: [] } });
  check("malformed enrollment_no → 422 validation", badEnroll.status === 422);

  const badDim = await admin("/api/students", { method: "POST", body: { fullName: "Dim Person", enrollmentNo: `DIM-${stamp}`, templates: [{ kind: "lbph944", vector: [1, 2, 3], quality: 0.5 }] } });
  check("wrong template dimension → 422", badDim.status === 422, `status=${badDim.status}`);

  const stuB = await admin("/api/students", {
    method: "POST",
    body: { fullName: `Rohit Kumar ${stamp}`, enrollmentNo: `E2E-B-${stamp}`, classLabel: "E2E-Class", templates: [{ kind: "lbph944", vector: validVector(944, 9), quality: 0.7 }] },
  });
  const studentBId = stuB.json?.student?.id;
  check("second student enroll → 200", stuB.status === 200);

  const notFound = await admin(`/api/students/${"11111111-1111-4111-8111-111111111111"}`);
  check("GET unknown student → 404", notFound.status === 404);

  // 5 · templates bundle for the browser matcher
  const templates = await admin("/api/templates");
  const bundled = (templates.json?.students ?? []).find((s) => s.id === studentAId);
  check("GET /api/templates bundles 3 templates for student A", templates.status === 200 && bundled?.templates?.length === 3);

  // 6 · session lifecycle
  const openSession = await admin("/api/sessions", { method: "POST", body: { title: `E2E Session ${stamp}`, classLabel: "E2E-Class", autoRecord: true } });
  check("open session → 200 status=open", openSession.status === 200 && openSession.json?.session?.status === "open", `status=${openSession.status}`);
  const sessionId = openSession.json?.session?.id;

  const clash = await admin("/api/sessions", { method: "POST", body: { title: "Clashing session", classLabel: "E2E-Class" } });
  check("second open session same class → 409", clash.status === 409, `status=${clash.status}`);

  // 7 · attendance: auto record, threshold enforcement, duplicate prevention
  const recOk = await teacher(`/api/sessions/${sessionId}/records`, {
    method: "POST",
    body: { studentId: studentAId, method: "auto", confidence: 0.7, matchedVia: "lbph", livenessScore: 0.05 },
  });
  check("auto record above LBPH threshold → written", recOk.status === 200 && recOk.json?.duplicate === false, `status=${recOk.status}`);

  const recDup = await teacher(`/api/sessions/${sessionId}/records`, {
    method: "POST",
    body: { studentId: studentAId, method: "auto", confidence: 0.9, matchedVia: "lbph" },
  });
  check("DUPLICATE auto record → duplicate:true (constraint)", recDup.status === 200 && recDup.json?.duplicate === true, `status=${recDup.status} ${JSON.stringify(recDup.json ?? "")}`);

  const recLow = await teacher(`/api/sessions/${sessionId}/records`, {
    method: "POST",
    body: { studentId: studentBId, method: "auto", confidence: 0.4, matchedVia: "lbph" },
  });
  check("auto record BELOW threshold → 422 rejected server-side", recLow.status === 422, `status=${recLow.status}`);

  const recManual = await teacher(`/api/sessions/${sessionId}/records`, {
    method: "POST",
    body: { studentId: studentBId, method: "manual", matchedVia: "manual" },
  });
  check("manual record (below-threshold fallback) → written", recManual.status === 200 && recManual.json?.duplicate === false);

  const badStudentRec = await teacher(`/api/sessions/${sessionId}/records`, { method: "POST", body: { studentId: "not-a-uuid", method: "manual" } });
  check("record w/ malformed studentId → 422", badStudentRec.status === 422);

  // 8 · close session blocks writes
  const close = await teacher(`/api/sessions/${sessionId}`, { method: "PATCH", body: { action: "close" } });
  check("close session → 200 status=closed", close.status === 200 && close.json?.session?.status === "closed");
  const afterClose = await teacher(`/api/sessions/${sessionId}/records`, { method: "POST", body: { studentId: studentAId, method: "manual" } });
  check("record into CLOSED session → 409", afterClose.status === 409, `status=${afterClose.status}`);

  // 9 · session detail & report & CSV
  const detail = await teacher(`/api/sessions/${sessionId}`);
  check("session detail shows 2 records", detail.status === 200 && detail.json?.records?.length === 2, `n=${detail.json?.records?.length}`);

  const report = await teacher("/api/reports/attendance?classLabel=E2E-Class");
  const rowA = (report.json?.rows ?? []).find((r) => r.studentId === studentAId);
  check("attendance percentage report computed", report.status === 200 && rowA && rowA.percentage >= 0 && rowA.total >= 1, `A: ${rowA?.attended}/${rowA?.total}`);

  const csv = await teacher("/api/reports/attendance?format=csv&classLabel=E2E-Class");
  check("CSV export streams with header row", csv.status === 200 && typeof csv.text === "string" && csv.text.startsWith("name,enrollment_no"), `ct=${csv.headers.get("content-type")}`);

  // 10 · bulk CSV import with validation & dedupe vs DB
  const csvText = [
    "name,enrollment_no,email,class",
    `Fresh Student,IMPORT-${stamp}-1,fs@example.com,E2E-Class`,
    `Dupe Row,IMPORT-${stamp}-1,d@example.com,E2E-Class`,
    `B,short!,bad@x,E2E-Class`,
    `Second One,IMPORT-${stamp}-2,,E2E-Class`,
  ].join("\n");
  const dry = await admin("/api/students/import", { method: "POST", body: { csv: csvText, dryRun: true } });
  check("bulk import dry-run validates (2 ok, errors flagged)", dry.status === 200 && dry.json?.willImport === 2 && dry.json?.errors?.length >= 2, JSON.stringify({ will: dry.json?.willImport, errs: dry.json?.errors?.length }));
  const real = await admin("/api/students/import", { method: "POST", body: { csv: csvText, dryRun: false } });
  check("bulk import commits 2 rows", real.status === 200 && real.json?.imported === 2, JSON.stringify(real.json?.error ?? { imported: real.json?.imported }));
  const replay = await admin("/api/students/import", { method: "POST", body: { csv: csvText, dryRun: false } });
  check("re-import skipped against DB (0 new)", replay.status === 200 && replay.json?.imported === 0 && replay.json?.skipped?.length >= 1);

  // 11 · audit trail captured the key events
  const audit = await admin("/api/audit?limit=100");
  const actions = new Set((audit.json?.logs ?? []).map((l) => l.action));
  check("audit: login+enroll+session+attendance recorded", ["auth.login", "student.enroll", "session.open", "attendance.auto"].every((a) => actions.has(a)), [...actions].join(","));
  check("audit: bulk import logged", actions.has("student.bulk_import"));

  // 12 · privacy: no raw images anywhere in API surface
  const rawNoImages = await admin("/api/templates");
  const asText = JSON.stringify(rawNoImages.json ?? {});
  check("templates payload contains only numeric vectors (no base64/images)", !asText.includes("data:image") && asText.length < 5_000_000);

  // 13 · archive-with-history, then cleanup
  const del = await admin(`/api/students/${studentAId}`, { method: "DELETE" });
  check("delete student WITH attendance → archived (history preserved)", del.status === 200 && del.json?.archived === true, JSON.stringify({ archived: del.json?.archived }));
  const afterArchive = await admin(`/api/sessions/${sessionId}`);
  check("archived student's attendance record still intact", (afterArchive.json?.records ?? []).some((r) => r.studentId === studentAId));

  // summary
  const failed = results.filter((r) => !r.ok);
  console.log(`${"—".repeat(50)}\nE2E: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("FAILURES:", failed.map((f) => f.name).join(" | "));
    process.exit(1);
  }
})().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(2);
});
