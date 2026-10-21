"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, EmptyState, ErrorState, Field, LoadingBlock, Modal, PageHeader, Select, TableShell, Td, TextInput, Th, cx, fmtDateTime, useToast } from "@/components/ui";
import { apiDelete, apiGet, apiPatch, apiPost, errorMessage } from "@/lib/client/api";
import { parseStudentCsv } from "@/lib/recognition/csv";

interface StudentRow {
  id: string;
  fullName: string;
  enrollmentNo: string;
  email: string | null;
  classLabel: string | null;
  status: "active" | "archived";
  templateCount: number;
  templateKind: string | null;
  attended: number;
  createdAt: string;
}

export default function StudentsPage() {
  return (
    <AppShell>
      <Students />
    </AppShell>
  );
}

function Students() {
  const toast = useToast();
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiGet<{ students: StudentRow[] }>("/api/students");
      setRows(r.students);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!statusFilter || r.status === statusFilter) &&
        (!q || r.fullName.toLowerCase().includes(q) || r.enrollmentNo.toLowerCase().includes(q) || (r.classLabel ?? "").toLowerCase().includes(q)),
    );
  }, [rows, query, statusFilter]);

  async function archive(s: StudentRow) {
    try {
      if (s.status === "active") {
        await apiPatch(`/api/students/${s.id}`, { status: "archived" });
        toast.push("info", `${s.fullName} archived — history preserved.`);
      } else {
        await apiPatch(`/api/students/${s.id}`, { status: "active" });
        toast.push("ok", `${s.fullName} restored.`);
      }
      void load();
    } catch (err) {
      toast.push("bad", errorMessage(err));
    }
  }

  async function remove(s: StudentRow) {
    if (!window.confirm(`Permanently delete ${s.fullName}? This cannot be undone.`)) return;
    try {
      const r = await apiDelete<{ archived: boolean; message?: string }>(`/api/students/${s.id}`);
      toast.push(r.archived ? "info" : "ok", r.message ?? "Student deleted.");
      void load();
    } catch (err) {
      toast.push("bad", errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        title="Students"
        subtitle={`${rows.filter((r) => r.status === "active").length} active · ${rows.filter((r) => r.templateCount > 0).length} with face templates`}
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>Bulk import</Button>
            <Link href="/enroll" className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400">Enroll student</Link>
          </>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-56 flex-1">
            <Field label="Search">
              {(p) => <TextInput {...p} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="name, enrollment or class…" aria-label="Search students" />}
            </Field>
          </div>
          <div className="w-44">
            <Field label="Status">
              {(p) => (
                <Select {...p} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">All</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </Select>
              )}
            </Field>
          </div>
          <Button variant="ghost" onClick={load} busy={loading}>Refresh</Button>
        </div>
      </Card>

      {loading && <LoadingBlock label="Loading roster…" />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          title={rows.length === 0 ? "No students yet" : "No matches"}
          message={rows.length === 0 ? "Enroll your first student with the camera, or import a class list from CSV." : "Try a different search term or status filter."}
          action={rows.length === 0 ? <Link href="/enroll" className="text-cyan-300 underline">Enroll now</Link> : undefined}
        />
      )}
      {!loading && !error && filtered.length > 0 && (
        <TableShell
          head={
            <tr>
              <Th>Student</Th>
              <Th>Enrollment</Th>
              <Th>Class</Th>
              <Th>Face templates</Th>
              <Th>Attended</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          }
        >
          {filtered.map((s) => (
            <tr key={s.id} className={cx(s.status === "archived" && "opacity-60")}>
              <Td>
                <span className="font-semibold text-slate-100">{s.fullName}</span>
                {s.email && <span className="block text-xs text-slate-500">{s.email}</span>}
              </Td>
              <Td className="font-mono text-xs">{s.enrollmentNo}</Td>
              <Td>{s.classLabel ?? "—"}</Td>
              <Td>
                {s.templateCount > 0 ? (
                  <span className="flex items-center gap-2">
                    <Badge tone={s.templateKind === "sface128" ? "ok" : "warn"}>{s.templateKind === "sface128" ? "SFace" : "LBPH"}</Badge>
                    <span className="text-xs text-slate-400">{s.templateCount}</span>
                  </span>
                ) : (
                  <Badge tone="muted">manual only</Badge>
                )}
              </Td>
              <Td>{s.attended}</Td>
              <Td>{s.status === "active" ? <Badge tone="ok">active</Badge> : <Badge tone="muted">archived</Badge>}</Td>
              <Td>
                <span className="flex gap-2 text-xs">
                  <button onClick={() => void archive(s)} className="text-slate-400 underline hover:text-amber-300">{s.status === "active" ? "Archive" : "Restore"}</button>
                  <button onClick={() => void remove(s)} className="text-slate-400 underline hover:text-rose-400">Delete</button>
                </span>
              </Td>
            </tr>
          ))}
        </TableShell>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Enrolled {fmtDateTime(rows[0]?.createdAt)} · newest first. Deleting a student with attendance history archives them instead, keeping records intact.
      </p>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={load} />
    </>
  );
}

function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ willImport: number; errors: Array<{ line: number; message: string }> } | null>(null);

  const local = useMemo(() => (text.trim() ? parseStudentCsv(text) : null), [text]);

  async function preview() {
    setBusy(true);
    try {
      const r = await apiPost<{ willImport: number; errors: Array<{ line: number; message: string }> }>("/api/students/import", { csv: text, dryRun: true });
      setResult(r);
    } catch (err) {
      toast.push("bad", errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setBusy(true);
    try {
      const r = await apiPost<{ imported: number; skipped: Array<{ line: number; message: string }>; errors: Array<{ line: number; message: string }> }>("/api/students/import", { csv: text, dryRun: false });
      toast.push("ok", `Imported ${r.imported} students (${r.skipped.length} skipped, ${r.errors.length} invalid rows).`);
      setResult(null);
      setText("");
      onDone();
      onClose();
    } catch (err) {
      toast.push("bad", errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const errors = [...(local?.errors ?? []), ...(result?.errors ?? [])];

  return (
    <Modal open={open} title="Bulk import students (CSV)" onClose={onClose} wide>
      <div className="space-y-3">
        <p className="text-sm text-slate-400">
          Header: <code className="rounded bg-slate-800 px-1 text-cyan-300">name, enrollment_no, email, class</code> (email/class optional). Rows are validated here and on the server; existing enrollment numbers are skipped, never overwritten.
        </p>
        <label className="block text-sm font-medium text-slate-300">
          Paste CSV or choose a file
          <input
            type="file"
            accept=".csv,text/csv"
            className="mt-1 block w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-slate-200"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              void f.text().then(setText);
            }}
          />
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          aria-label="CSV content"
          spellCheck={false}
          className="w-full rounded-lg border border-slate-700 bg-slate-950/60 p-3 font-mono text-xs text-slate-200"
          placeholder={"name,enrollment_no,email,class\nAsha Verma,CS2024-042,asha@school.edu,CS-A"}
        />
        {local && (
          <p className="text-xs text-slate-400">
            Parsed {local.rows.length} valid row(s) of {local.totalDataLines}. {local.errors.length} error(s).
          </p>
        )}
        {result && (
          <p className="text-xs text-emerald-300">Server preview: {result.willImport} new student(s) will be imported.</p>
        )}
        {errors.length > 0 && (
          <ul className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-rose-500/30 bg-rose-500/5 p-2 text-xs text-rose-200">
            {errors.slice(0, 20).map((e, i) => (
              <li key={i}>line {e.line}: {e.message}</li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={preview} busy={busy} disabled={!text.trim()}>Validate (dry run)</Button>
          <Button onClick={commit} busy={busy} disabled={!text.trim() || (local ? local.rows.length === 0 : true)}>Import</Button>
        </div>
      </div>
    </Modal>
  );
}
