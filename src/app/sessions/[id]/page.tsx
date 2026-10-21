"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, TableShell, Td, Th, cx, fmtDateTime, useToast } from "@/components/ui";
import { apiDelete, apiGet, apiPatch, apiPost, errorMessage } from "@/lib/client/api";

interface Detail {
  session: { id: string; title: string; classLabel: string | null; status: "open" | "closed"; autoRecord: boolean; startedAt: string; endedAt: string | null };
  records: Array<{
    id: string;
    studentId: string;
    fullName: string;
    enrollmentNo: string;
    method: "auto" | "manual";
    confidence: number | null;
    matchedVia: string | null;
    livenessScore: number | null;
    recordedAt: string;
    recorder: string | null;
  }>;
  roster: Array<{ id: string; fullName: string; enrollmentNo: string }>;
}

export default function SessionDetailPage() {
  return (
    <AppShell>
      <SessionDetail />
    </AppShell>
  );
}

function SessionDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiGet<Detail>(`/api/sessions/${params.id}`));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function closeSession() {
    setBusy(true);
    try {
      await apiPatch(`/api/sessions/${params.id}`, { action: "close" });
      toast.push("ok", "Session closed.");
      void load();
    } catch (err) {
      toast.push("bad", errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function mark(studentId: string, fullName: string) {
    setBusy(true);
    try {
      await apiPost(`/api/sessions/${params.id}/records`, { studentId, method: "manual", matchedVia: "manual" });
      toast.push("ok", `Marked ${fullName}.`);
      void load();
    } catch (err) {
      toast.push("bad", errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function unmark(studentId: string, fullName: string) {
    setBusy(true);
    try {
      await apiDelete(`/api/sessions/${params.id}/records`, { studentId });
      toast.push("info", `Removed ${fullName}.`);
      void load();
    } catch (err) {
      toast.push("bad", errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingBlock label="Loading session…" />;
  if (error || !data) return <ErrorState message={error ?? "Session unavailable."} onRetry={load} />;

  const presentIds = new Set(data.records.map((r) => r.studentId));
  const absentees = data.roster.filter((r) => !presentIds.has(r.id));

  return (
    <>
      <PageHeader
        title={data.session.title}
        subtitle={`${data.session.classLabel ?? "All classes"} · started ${fmtDateTime(data.session.startedAt)}${data.session.endedAt ? ` · ended ${fmtDateTime(data.session.endedAt)}` : ""}`}
        actions={
          <div className="flex gap-2">
            <a href={`/api/reports/attendance?format=csv`} className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-cyan-400" download>
              Export class CSV
            </a>
            {data.session.status === "open" && (
              <Button variant="danger" busy={busy} onClick={closeSession}>Close session</Button>
            )}
            <Button variant="ghost" onClick={() => router.push("/monitor")}>Open monitor</Button>
          </div>
        }
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-slate-100">Present ({data.records.length})</h2>
            <Badge tone={data.session.status === "open" ? "warn" : "muted"}>{data.session.status}</Badge>
          </div>
          {data.records.length === 0 ? (
            <EmptyState title="Nobody marked yet" message="Run the live monitor or add students manually from the right." />
          ) : (
            <TableShell
              head={<tr><Th>Student</Th><Th>Method</Th><Th>Confidence</Th><Th>Time</Th><Th></Th></tr>}
            >
              {data.records.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <span className="font-semibold text-slate-100">{r.fullName}</span>
                    <span className="block font-mono text-[11px] text-slate-500">{r.enrollmentNo}</span>
                  </Td>
                  <Td>
                    {r.method === "auto" ? <Badge tone={r.matchedVia === "sface" ? "ok" : "info"}>auto · {r.matchedVia}</Badge> : <Badge tone="muted">manual{r.recorder ? ` · ${r.recorder}` : ""}</Badge>}
                  </Td>
                  <Td>
                    {r.confidence !== null ? (
                      <span title={`liveness ${r.livenessScore ?? "n/a"}`}>{(r.confidence * 100).toFixed(0)}%</span>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="text-xs text-slate-400">{fmtDateTime(r.recordedAt)}</Td>
                  <Td>
                    {data.session.status === "open" && (
                      <button aria-label={`Remove ${r.fullName}`} onClick={() => void unmark(r.studentId, r.fullName)} className="text-slate-500 hover:text-rose-400">✕</button>
                    )}
                  </Td>
                </tr>
              ))}
            </TableShell>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-bold text-slate-100">Not marked ({absentees.length})</h2>
          {absentees.length === 0 ? (
            <p className={cx("rounded-lg border px-3 py-2 text-sm", "border-emerald-500/30 bg-emerald-500/10 text-emerald-200")}>Full attendance — everyone in the roster is marked.</p>
          ) : (
            <ul className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
              {absentees.map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-lg bg-slate-950/50 px-3 py-2">
                  <span className="text-sm text-slate-200">
                    {s.fullName} <span className="font-mono text-[11px] text-slate-500">{s.enrollmentNo}</span>
                  </span>
                  {data.session.status === "open" ? (
                    <Button variant="outline" onClick={() => void mark(s.id, s.fullName)} disabled={busy}>Mark present</Button>
                  ) : (
                    <Badge tone="muted">closed</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </>
  );
}
