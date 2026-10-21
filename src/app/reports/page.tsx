"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, EmptyState, ErrorState, Field, LoadingBlock, PageHeader, Select, StatCard, TableShell, Td, Th } from "@/components/ui";
import { apiGet, errorMessage } from "@/lib/client/api";

interface ReportRow {
  studentId: string;
  fullName: string;
  enrollmentNo: string;
  classLabel: string | null;
  attended: number;
  total: number;
  percentage: number;
  deficient: boolean;
}

interface ReportPayload {
  overall: { sessions: number; students: number; avgPercentage: number; deficientCount: number };
  sessions: Array<{ id: string; title: string; classLabel: string | null; status: string; startedAt: string; recordCount: number }>;
  rows: ReportRow[];
}

export default function ReportsPage() {
  return (
    <AppShell>
      <Reports />
    </AppShell>
  );
}

function Reports() {
  const [data, setData] = useState<ReportPayload | null>(null);
  const [classes, setClasses] = useState<string[]>([]);
  const [classLabel, setClassLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = classLabel ? `?classLabel=${encodeURIComponent(classLabel)}` : "";
      const [report, students] = await Promise.all([
        apiGet<ReportPayload>(`/api/reports/attendance${q}`),
        apiGet<{ students: Array<{ classLabel: string | null }> }>("/api/students"),
      ]);
      setData(report);
      setClasses(Array.from(new Set(students.students.map((s) => s.classLabel).filter(Boolean) as string[])).sort());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [classLabel]);

  useEffect(() => {
    void load();
  }, [load]);

  const csvHref = `/api/reports/attendance?format=csv${classLabel ? `&classLabel=${encodeURIComponent(classLabel)}` : ""}`;

  return (
    <>
      <PageHeader
        title="Attendance reports"
        subtitle="Percentage-per-student report computed from authoritative DB records (no CSV round-trips)."
        actions={
          <a href={csvHref} className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-cyan-400" download>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Export CSV
          </a>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <Field label="Class filter">
              {(p) => (
                <Select {...p} value={classLabel} onChange={(e) => setClassLabel(e.target.value)}>
                  <option value="">All classes</option>
                  {classes.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Button variant="outline" onClick={load} busy={loading}>Refresh</Button>
        </div>
      </Card>

      {loading && <LoadingBlock label="Computing report…" />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && data && (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Sessions considered" value={data.overall.sessions} tone="info" />
            <StatCard label="Average attendance" value={`${data.overall.avgPercentage}%`} tone={data.overall.avgPercentage >= 75 ? "ok" : "warn"} />
            <StatCard label="Below 75% threshold" value={data.overall.deficientCount} hint="Flagged for follow-up" tone={data.overall.deficientCount ? "bad" : "ok"} />
          </section>

          <div className="mt-4">
            {data.rows.length === 0 ? (
              <EmptyState title="Nothing to report yet" message={data.overall.sessions === 0 ? "Open and record at least one attendance session." : "No active students match this class filter."} />
            ) : (
              <TableShell
                head={
                  <tr>
                    <Th>Student</Th>
                    <Th>Enrollment</Th>
                    <Th>Class</Th>
                    <Th>Present</Th>
                    <Th>Sessions</Th>
                    <Th className="w-56">Percentage</Th>
                    <Th>Status</Th>
                  </tr>
                }
              >
                {data.rows.map((r) => (
                  <tr key={r.studentId} className={r.deficient ? "bg-rose-500/5" : undefined}>
                    <Td className="font-semibold">{r.fullName}</Td>
                    <Td>{r.enrollmentNo}</Td>
                    <Td>{r.classLabel ?? "—"}</Td>
                    <Td>{r.attended}</Td>
                    <Td>{r.total}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuenow={Math.round(r.percentage)} aria-valuemin={0} aria-valuemax={100} aria-label={`${r.fullName} attendance`}>
                          <div className={`h-full ${r.deficient ? "bg-rose-400" : "bg-emerald-400"}`} style={{ width: `${Math.min(100, r.percentage)}%` }} />
                        </div>
                        <span className="tabular-nums text-xs text-slate-300">{r.percentage}%</span>
                      </div>
                    </Td>
                    <Td>{r.deficient ? <Badge tone="bad">shortage</Badge> : <Badge tone="ok">ok</Badge>}</Td>
                  </tr>
                ))}
              </TableShell>
            )}
          </div>

          <Card className="mt-4">
            <h2 className="mb-2 font-bold text-slate-100">Sessions in scope</h2>
            <ul className="space-y-1 text-sm text-slate-400">
              {data.sessions.slice(0, 12).map((s) => (
                <li key={s.id} className="flex justify-between">
                  <span>{s.title} {s.classLabel ? <span className="text-slate-600">· {s.classLabel}</span> : null}</span>
                  <span>{s.recordCount} marked · <span className={s.status === "open" ? "text-amber-300" : ""}>{s.status}</span></span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
