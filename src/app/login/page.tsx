"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, errorMessage } from "@/lib/client/api";
import { Button, Card, Field, TextInput, useToast } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const toast = useToastOptional();
  const [mode, setMode] = useState<"login" | "bootstrap" | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", password: "", name: "" });

  useEffect(() => {
    let alive = true;
    apiGet<{ needsBootstrap: boolean }>("/api/auth/status")
      .then((s) => alive && setMode(s.needsBootstrap ? "bootstrap" : "login"))
      .catch(() => alive && setMode("login"));
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "bootstrap") {
        await apiPost("/api/auth/bootstrap", form);
        toast.push("ok", "Admin account created. Welcome to FaceWise v3.");
      } else {
        await apiPost("/api/auth/login", { email: form.email, password: form.password });
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const isBootstrap = mode === "bootstrap";

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.08),transparent_60%)] px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 to-emerald-400 text-2xl font-black text-slate-950">F</span>
          <h1 className="text-3xl font-bold tracking-tight text-slate-50">
            Face<span className="text-cyan-400">Wise</span> <span className="text-base font-semibold text-slate-500">v3</span>
          </h1>
          <p className="mt-2 text-sm text-slate-400">Privacy-first face attendance. Biometrics stay on your machine.</p>
        </div>

        <Card>
          {mode === "loading" ? (
            <p role="status" className="py-8 text-center text-sm text-slate-400">Checking server…</p>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <h2 className="text-lg font-bold text-slate-100">{isBootstrap ? "Create the administrator account" : "Sign in"}</h2>
              {isBootstrap && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  No users exist yet. This first-run setup creates the sole admin and then closes permanently.
                </p>
              )}
              {isBootstrap && (
                <Field label="Full name">
                  {(p) => <TextInput {...p} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dr. A. Sharma" autoComplete="name" />}
                </Field>
              )}
              <Field label="Email">
                {(p) => <TextInput {...p} required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@school.edu" autoComplete="username" />}
              </Field>
              <Field label="Password" hint={isBootstrap ? "At least 10 characters with upper, lower and a digit." : undefined}>
                {(p) => <TextInput {...p} required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete={isBootstrap ? "new-password" : "current-password"} />}
              </Field>
              {error && <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
              <Button type="submit" busy={busy} className="w-full">
                {isBootstrap ? "Create admin & sign in" : "Sign in"}
              </Button>
            </form>
          )}
        </Card>
        <p className="mt-6 text-center text-xs text-slate-600">
          Sessions, students and attendance are stored in your local PostgreSQL — never a third-party bucket.
        </p>
      </div>
    </main>
  );
}

/** useToast has a no-op default context, so it is safe on the provider-less login screen. */
function useToastOptional() {
  return useToast();
}
