"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
type BtnVariant = "primary" | "outline" | "ghost" | "danger";
export function Button({
  variant = "primary",
  busy = false,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; busy?: boolean }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed";
  const styles: Record<BtnVariant, string> = {
    primary: "bg-cyan-500 text-slate-950 hover:bg-cyan-400 active:bg-cyan-600",
    outline: "border border-slate-600 text-slate-200 hover:border-cyan-400 hover:text-cyan-300",
    ghost: "text-slate-300 hover:bg-slate-800",
    danger: "bg-rose-600/90 text-white hover:bg-rose-500",
  };
  return (
    <button className={cx(base, styles[variant], className)} disabled={busy || rest.disabled} {...rest}>
      {busy && (
        <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-black/20", className)} {...rest}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-50">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </header>
  );
}

type BadgeTone = "ok" | "warn" | "bad" | "info" | "muted";
export function Badge({ tone = "muted", children }: { tone?: BadgeTone; children: ReactNode }) {
  const styles: Record<BadgeTone, string> = {
    ok: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    warn: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    bad: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    info: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    muted: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  };
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", styles[tone])}>
      {children}
    </span>
  );
}

export function StatCard({ label, value, hint, tone = "info" }: { label: string; value: ReactNode; hint?: string; tone?: BadgeTone }) {
  const accent: Record<BadgeTone, string> = {
    ok: "from-emerald-400/60",
    warn: "from-amber-400/60",
    bad: "from-rose-400/60",
    info: "from-cyan-400/60",
    muted: "from-slate-400/60",
  };
  return (
    <Card className="relative overflow-hidden">
      <div className={cx("pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r to-transparent", accent[tone])} />
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-50">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
}) {
  const id = useId();
  const descId = hint || error ? `${id}-desc` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-300">
        {label}
      </label>
      {children({ id, "aria-describedby": descId, "aria-invalid": error ? true : undefined })}
      {error ? (
        <p id={descId} role="alert" className="text-xs text-rose-300">{error}</p>
      ) : hint ? (
        <p id={descId} className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/40";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, "appearance-none", props.className)} />;
}

// ---------------------------------------------------------------------------
// Feedback states
// ---------------------------------------------------------------------------
export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "progress"}
      className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800"
    >
      <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-14 text-slate-400">
      <span aria-hidden className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-700 px-6 py-12 text-center">
      <svg aria-hidden width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-slate-600">
        <rect x="3" y="4" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 21h8M12 18v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <p className="font-semibold text-slate-200">{title}</p>
      <p className="max-w-md text-sm text-slate-400">{message}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
      <span>{message}</span>
      {onRetry && <Button variant="outline" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
export function Modal({ open, title, onClose, children, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close dialog" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cx("relative max-h-[88vh] w-full overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl", wide ? "max-w-3xl" : "max-w-lg")}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-100">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
interface Toast {
  id: number;
  tone: "ok" | "bad" | "info";
  message: string;
}
const ToastCtx = createContext<{ push: (tone: Toast["tone"], message: string) => void }>({ push: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast["tone"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4800);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur",
              t.tone === "ok" && "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
              t.tone === "bad" && "border-rose-500/40 bg-rose-500/15 text-rose-200",
              t.tone === "info" && "border-cyan-500/40 bg-cyan-500/15 text-cyan-200",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

// ---------------------------------------------------------------------------
// Table helpers
// ---------------------------------------------------------------------------
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th scope="col" className={cx("px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400", className)}>{children}</th>;
}
export function Td({ children, className, title }: { children?: ReactNode; className?: string; title?: string }) {
  return <td title={title} className={cx("px-3 py-2 text-sm text-slate-200", className)}>{children}</td>;
}

export function TabsSimple({ value, onChange, tabs }: { value: string; onChange: (id: string) => void; tabs: Array<{ id: string; label: string }> }) {
  return (
    <div role="tablist" aria-label="Sections" className="flex gap-1 border-b border-slate-800">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "rounded-t-lg px-4 py-2 text-sm font-semibold transition",
            value === t.id ? "border-b-2 border-cyan-400 bg-slate-900 text-cyan-300" : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-200",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
export function TableShell({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full min-w-[560px] border-collapse">
        <thead className="bg-slate-900/80">{head}</thead>
        <tbody className="divide-y divide-slate-800/70">{children}</tbody>
      </table>
    </div>
  );
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
