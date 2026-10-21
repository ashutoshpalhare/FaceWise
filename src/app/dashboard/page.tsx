"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Badge, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, ProgressBar, StatCard, TableShell, Td, Th, cx, fmtDateTime } from "@/components/ui";
import { apiGet, errorMessage } from "@/lib/client/api";

interface Summary {
  students: Array<{ id: string; fullName: string; templateCount: number; status: string }>;
  sessions: Array<{ id: string; title: string; status: string; startedAt: string; endedAt: string | null; recordCount: number; createdBy: string | null; classLabel: string | null }>;
  report: { overall: { sessions: number; students: number; avgPercentage: number; deficientCount: number } };
  health: { ok: boolean; engine?: { primary: string; fallback: string } };
}

export default function DashboardPage() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}

function Dashboard() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [students, sessions, report, health] = await Promise.all([
        apiGet<{ students: Summary["students"] }>("/api/students"),
        apiGet<{ sessions: Summary["sessions"] }>("/api/sessions"),
        apiGet<Summary["report"]>("/api/reports/attendance"),
        apiGet<Summary["health"]>("/api/health"),
      ]);
      setData({
        students: students.students,
        sessions: sessions.sessions,
        report,
        health,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingBlock label="Loading dashboard…" />;
  if (error || !data) return <ErrorState message={error ?? "Could not load dashboard."} onRetry={load} />;

  const activeStudents = data.students.filter((s) => s.status === "active");
  const enrolledWithFaces = activeStudents.filter((s) => s.templateCount > 0).length;
  const openSessions = data.sessions.filter((s) => s.status === "open");
  const last8 = [...data.sessions].slice(0, 8).reverse();
  const maxCount = Math.max(1, ...last8.map((s) => s.recordCount));

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Everything below is read live from the authoritative PostgreSQL store."
        actions={
          <>
            <Link href="/enroll" className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400">Enroll a face</Link>
            <Link href="/monitor" className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-cyan-400">Start monitoring</Link>
          </>
        }
      />

      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active students" value={activeStudents.length} hint={`${enrolledWithFaces} with face templates`} tone="info" />
        <StatCard label="Attendance sessions" value={data.sessions.length} hint={`${openSessions.length} open now`} tone={openSessions.length ? "warn" : "ok"} />
        <StatCard label="Class average" value={`${data.report.overall.avgPercentage}%`} hint={`${data.report.overall.deficientCount} below 75%`} tone={data.report.overall.deficientCount > 0 ? "bad" : "ok"} />
        <StatCard label="Engine" value={<span className="text-xl">{data.health.ok ? "Online" : "Degraded"}</span>} hint="SFace primary · LBPH fallback" tone={data.health.ok ? "ok" : "bad"} />
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-slate-100">Attendance per session (recent)</h2>
            <Badge tone="info">auto + manual</Badge>
          </div>
          {last8.length === 0 ? (
            <EmptyState title="No sessions yet" message="Open a session from Live Monitor to start recording attendance." action={<Link className="text-cyan-300 underline" href="/monitor">Go to monitor</Link>} />
          ) : (
            <div className="flex h-48 items-end gap-2" role="img" aria-label="Bar chart of attendance counts for recent sessions">
              {last8.map((s) => (
                <div key={s.id} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] text-slate-400">{s.recordCount}</span>
                  <div
                    className={cx("w-full rounded-t-md bg-gradient-to-t", s.status === "open" ? "from-amber-500/60 to-amber-300/80" : "from-cyan-600/50 to-cyan-400/80")}
                    style={{ height: `${Math.max(4, (s.recordCount / maxCount) * 100)}%` }}
                  />
                  <span className="w-full truncate text-center text-[10px] text-slate-500" title={s.title}>{s.title}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-bold text-slate-100">Recent sessions</h2>
          {data.sessions.length === 0 ? (
            <EmptyState title="Nothing recorded yet" message="Sessions you open will appear here with live counts." />
          ) : (
            <ul className="space-y-2">
              {data.sessions.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <Link href={`/sessions/${s.id}`} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 hover:border-cyan-500/50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-200">{s.title}</span>
                      <span className="block text-xs text-slate-500">{fmtDateTime(s.startedAt)} · {s.classLabel ?? "all classes"}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-bold text-cyan-300">{s.recordCount}</span>
                      <Badge tone={s.status === "open" ? "warn" : "ok"}>{s.status}</Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-3 font-bold text-slate-100">Roster coverage</h2>
        {activeStudents.length === 0 ? (
          <EmptyState title="No students enrolled" message="Register a student with 50 quality-checked face captures to enable automatic attendance." action={<Link className="text-cyan-300 underline" href="/enroll">Enroll first student</Link>} />
        ) : (
          <TableShell
            head={<tr><Th>Student</Th><Th>Templates</Th><Th>Coverage</Th></tr>}
          >
            {activeStudents.slice(0, 6).map((s) => (
              <tr key={s.id}>
                <Td>{s.fullName}</Td>
                <Td>{s.templateCount}</Td>
                <Td className="w-40"><ProgressBar value={Math.min(1, s.templateCount / 10)} label={`${s.fullName} template coverage`} /></Td>
              </tr>
            ))}
          </TableShell>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Raw enrollment frames are processed in the browser and discarded; only compact 128-d/944-d descriptors are persisted server-side.
        </p>
      </Card>
    </>
  );
}
