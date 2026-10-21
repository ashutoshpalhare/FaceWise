"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, EmptyState, ErrorState, Field, LoadingBlock, PageHeader, TableShell, Td, TextInput, Th, cx, fmtDateTime } from "@/components/ui";
import { apiGet, apiPost, errorMessage } from "@/lib/client/api";

interface SessionRow {
  id: string;
  title: string;
  classLabel: string | null;
  status: "open" | "closed";
  autoRecord: boolean;
  startedAt: string;
  endedAt: string | null;
  createdBy: string | null;
  recordCount: number;
}

export default function SessionsPage() {
  return (
    <AppShell>
      <Sessions />
    </AppShell>
  );
}

function Sessions() {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiGet<{ sessions: SessionRow[] }>("/api/sessions");
      setRows(r.sessions);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setCreateError(null);
    try {
      const r = await apiPost<{ session: SessionRow }>("/api/sessions", {
        title: title.trim() || `Attendance ${new Date().toLocaleDateString()}`,
        autoRecord: true,
      });
      setTitle("");
      // Jump straight into monitoring with the fresh session.
      window.location.href = "/monitor";
      void r;
    } catch (err) {
      setCreateError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Attendance sessions" subtitle="Each session is one class period; records live only in the database." />

      <Card className="mb-4">
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <Field label="Open a new session" hint="Only one open session per class at a time.">
              {(p) => <TextInput {...p} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="CS-A · Lecture 12 · 14 Jan" maxLength={120} />}
            </Field>
          </div>
          <Button type="submit" busy={busy}>Open & monitor</Button>
          {createError && <p role="alert" className="w-full text-sm text-rose-300">{createError}</p>}
        </form>
      </Card>

      {loading && <LoadingBlock label="Loading sessions…" />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && rows.length === 0 && (
        <EmptyState title="No sessions yet" message="Open your first attendance session above, then run the live monitor." />
      )}
      {!loading && !error && rows.length > 0 && (
        <TableShell
          head={
            <tr>
              <Th>Session</Th>
              <Th>Class</Th>
              <Th>Started</Th>
              <Th>Ended</Th>
              <Th>Marked</Th>
              <Th>Status</Th>
            </tr>
          }
        >
          {rows.map((s) => (
            <tr key={s.id} className={cx(s.status === "open" && "bg-amber-500/5")}>
              <Td>
                <Link href={`/sessions/${s.id}`} className="font-semibold text-slate-100 underline-offset-2 hover:underline">
                  {s.title}
                </Link>
                {s.createdBy && <span className="block text-xs text-slate-500">by {s.createdBy}</span>}
              </Td>
              <Td>{s.classLabel ?? "all"}</Td>
              <Td>{fmtDateTime(s.startedAt)}</Td>
              <Td>{fmtDateTime(s.endedAt)}</Td>
              <Td className="font-bold text-cyan-300">{s.recordCount}</Td>
              <Td>
                <span className="flex gap-2">
                  <Badge tone={s.status === "open" ? "warn" : "muted"}>{s.status}</Badge>
                  {s.autoRecord ? <Badge tone="info">auto</Badge> : <Badge tone="muted">manual</Badge>}
                </span>
              </Td>
            </tr>
          ))}
        </TableShell>
      )}
    </>
  );
}
