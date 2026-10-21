"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/client/api";
import { Badge, ToastProvider, cx } from "@/components/ui";

export interface MeUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "teacher";
}

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "grid", roles: ["admin", "teacher"] },
  { href: "/enroll", label: "Enroll Face", icon: "camera", roles: ["admin", "teacher"] },
  { href: "/monitor", label: "Live Monitor", icon: "eye", roles: ["admin", "teacher"] },
  { href: "/sessions", label: "Sessions", icon: "clock", roles: ["admin", "teacher"] },
  { href: "/students", label: "Students", icon: "users", roles: ["admin", "teacher"] },
  { href: "/reports", label: "Reports", icon: "chart", roles: ["admin", "teacher"] },
  { href: "/admin", label: "Admin", icon: "shield", roles: ["admin"] },
] as const;

function Icon({ name }: { name: string }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true as const };
  switch (name) {
    case "grid":
      return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" /></svg>;
    case "camera":
      return <svg {...common}><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1L8 4h8l1.5 2h1A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-9Z" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.8" /></svg>;
    case "eye":
      return <svg {...common}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" /></svg>;
    case "clock":
      return <svg {...common}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "users":
      return <svg {...common}><circle cx="9" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.8a3.5 3.5 0 0 1 0 6.4M18 13.6a6.5 6.5 0 0 1 3.5 6.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "chart":
      return <svg {...common}><path d="M4 20V10M10 20V4m6 16v-7m6 7V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" transform="translate(-1)" /></svg>;
    case "shield":
      return <svg {...common}><path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6l-7-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>;
    default:
      return null;
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<MeUser | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    apiGet<{ user: MeUser | null }>("/api/auth/me")
      .then((r) => {
        if (!alive) return;
        if (!r.user) {
          router.replace("/login");
          return;
        }
        setUser(r.user);
      })
      .catch(() => alive && setUser(null));
    return () => {
      alive = false;
    };
  }, [router]);

  async function signOut() {
    try {
      await apiPost("/api/auth/logout");
    } finally {
      router.replace("/login");
    }
  }

  const nav = NAV.filter((n) => user && (n.roles as readonly string[]).includes(user.role));

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-slate-950 text-slate-200">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-cyan-400 focus:px-3 focus:py-2 focus:text-slate-950">
          Skip to content
        </a>
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-950/80 p-4 lg:flex">
          <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-1">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-400 font-black text-slate-950">F</span>
            <span className="text-lg font-bold tracking-tight text-slate-50">
              Face<span className="text-cyan-400">Wise</span>
            </span>
            <Badge tone="info">v3</Badge>
          </Link>
          <nav aria-label="Primary" className="flex flex-1 flex-col gap-1">
            {nav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                    active ? "bg-cyan-500/15 text-cyan-300" : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200",
                  )}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-4 border-t border-slate-800 pt-4 text-sm">
            {user && (
              <div className="mb-2 flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-800 text-xs font-bold text-cyan-300">
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-slate-200">{user.name}</span>
                  <span className="block text-xs capitalize text-slate-500">{user.role}</span>
                </span>
              </div>
            )}
            <button onClick={signOut} className="w-full rounded-lg border border-slate-700 px-3 py-1.5 text-left text-slate-300 hover:border-rose-400 hover:text-rose-300">
              Sign out
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/90 px-4 py-3 backdrop-blur lg:hidden">
            <Link href="/dashboard" className="flex items-center gap-2 font-bold text-slate-50">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-emerald-400 text-sm text-slate-950">F</span>
              FaceWise
            </Link>
            <button onClick={signOut} className="text-sm text-slate-400 hover:text-rose-300">Sign out</button>
          </header>
          <nav aria-label="Mobile primary" className="flex gap-1 overflow-x-auto border-b border-slate-800 bg-slate-950/70 px-3 py-2 lg:hidden">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
                  pathname.startsWith(item.href) ? "bg-cyan-500/20 text-cyan-300" : "text-slate-400 hover:bg-slate-800",
                )}
              >
                <Icon name={item.icon} />
                {item.label}
              </Link>
            ))}
          </nav>
          <main id="main" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
