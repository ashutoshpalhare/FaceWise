"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, EmptyState, ErrorState, Field, LoadingBlock, Modal, PageHeader, Select, TableShell, TabsSimple, Td, TextInput, Th, fmtDateTime, useToast } from "@/components/ui";
import { apiDelete, apiGet, apiPatch, apiPost, errorMessage } from "@/lib/client/api";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "teacher";
  createdAt: string;
}

interface AuditRow {
  id: string;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export default function AdminPage() {
  return (
    <AppShell>
      <Admin />
    </AppShell>
  );
}

function Admin() {
  const toast = useToast();
  const [tab, setTab] = useState<"users" | "audit">("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, a] = await Promise.all([
        apiGet<{ users: AdminUser[] }>("/api/users"),
        apiGet<{ logs: AuditRow[] }>("/api/audit?limit=100"),
      ]);
      setUsers(u.users);
      setLogs(a.logs);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resetPassword(u: AdminUser) {
    const pw = window.prompt(`New password for ${u.email} (min 10 chars, upper/lower/digit):`);
    if (!pw) return;
    try {
      await apiPatch(`/api/users/${u.id}`, { password: pw });
      toast.push("ok", `Password updated for ${u.email}.`);
    } catch (err) {
      toast.push("bad", errorMessage(err));
    }
  }

  async function changeRole(u: AdminUser, role: "admin" | "teacher") {
    try {
      await apiPatch(`/api/users/${u.id}`, { role });
      toast.push("ok", `${u.name} is now ${role}.`);
      void load();
    } catch (err) {
      toast.push("bad", errorMessage(err));
    }
  }

  async function remove(u: AdminUser) {
    if (!window.confirm(`Delete user ${u.email}?`)) return;
    try {
      await apiDelete(`/api/users/${u.id}`);
      toast.push("info", `Deleted ${u.email}.`);
      void load();
    } catch (err) {
      toast.push("bad", errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader title="Administration" subtitle="Users and the append-only audit trail (RBAC enforced server-side)." actions={<Button variant="ghost" onClick={load} busy={loading}>Refresh</Button>} />

      <TabsSimple
        value={tab}
        onChange={(v) => setTab(v as "users" | "audit")}
        tabs={[
          { id: "users", label: `Users (${users.length})` },
          { id: "audit", label: "Audit log" },
        ]}
      />

      {loading && <LoadingBlock />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && tab === "users" && (
        <Card className="mt-4">
          <div className="mb-3 flex justify-end">
            <Button onClick={() => setCreateOpen(true)}>Add user</Button>
          </div>
          <TableShell head={<tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Created</Th><Th>Actions</Th></tr>}>
            {users.map((u) => (
              <tr key={u.id}>
                <Td className="font-semibold">{u.name}</Td>
                <Td>{u.email}</Td>
                <Td>
                  <Select aria-label={`Role for ${u.name}`} className="w-32" value={u.role} onChange={(e) => void changeRole(u, e.target.value as "admin" | "teacher")}>
                    <option value="teacher">teacher</option>
                    <option value="admin">admin</option>
                  </Select>
                </Td>
                <Td>{fmtDateTime(u.createdAt)}</Td>
                <Td>
                  <span className="flex gap-3 text-xs">
                    <button className="text-slate-400 underline hover:text-cyan-300" onClick={() => void resetPassword(u)}>Reset password</button>
                    <button className="text-slate-400 underline hover:text-rose-400" onClick={() => void remove(u)}>Delete</button>
                  </span>
                </Td>
              </tr>
            ))}
          </TableShell>
          <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onDone={load} />
        </Card>
      )}

      {!loading && !error && tab === "audit" && (
        <div className="mt-4">
          {logs.length === 0 ? (
            <EmptyState title="No audit entries" message="Sign-ins, enrollments, attendance writes and corrections are recorded here automatically." />
          ) : (
            <TableShell head={<tr><Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Entity</Th><Th>Details</Th><Th>IP</Th></tr>}>
              {logs.map((l) => (
                <tr key={l.id}>
                  <Td className="whitespace-nowrap text-xs">{fmtDateTime(l.createdAt)}</Td>
                  <Td>{l.actorName ?? <Badge tone="muted">system</Badge>}</Td>
                  <Td><span className="font-mono text-xs text-cyan-300">{l.action}</span></Td>
                  <Td className="text-xs">{l.entityType}{l.entityId ? ` · ${l.entityId.slice(0, 8)}` : ""}</Td>
                  <Td className="max-w-64 truncate font-mono text-[11px] text-slate-400" title={JSON.stringify(l.details ?? {})}>{l.details ? JSON.stringify(l.details) : "—"}</Td>
                  <Td className="text-xs">{l.ip ?? "—"}</Td>
                </tr>
              ))}
            </TableShell>
          )}
          <p className="mt-2 text-xs text-slate-500">Showing latest {logs.length} entries. Logs are append-only; deleting users or students never removes audit rows.</p>
        </div>
      )}
    </>
  );
}

function CreateUserModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "teacher" as "admin" | "teacher" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await apiPost("/api/users", form);
      toast.push("ok", `${form.name} added as ${form.role}.`);
      setForm({ name: "", email: "", password: "", role: "teacher" });
      onDone();
      onClose();
    } catch (error) {
      setErr(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Add staff user" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name">{(p) => <TextInput {...p} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
        <Field label="Email">{(p) => <TextInput {...p} required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
        <Field label="Temporary password" hint="At least 10 characters, upper/lower + digit. The user should change it after first sign-in.">
          {(p) => <TextInput {...p} required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
        </Field>
        <Field label="Role">
          {(p) => (
            <Select {...p} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "teacher" })}>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </Select>
          )}
        </Field>
        {err && <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" busy={busy}>Create user</Button>
        </div>
      </form>
    </Modal>
  );
}
