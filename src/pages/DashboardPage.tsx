import { useEffect, useState, type ReactNode } from 'react';
import {
  Users,
  CalendarCheck,
  ClipboardList,
  TrendingUp,
  Clock,
  CheckCircle2,
  History,
} from 'lucide-react';
import { Card, CardHeader, StatCard, BarChart, DonutChart, Badge } from '@/components/ui';
import {
  fetchDashboardStats,
  fetchWeeklyAttendance,
  fetchSubjectDistribution,
  fetchRecentSessions,
} from '@/lib/queries';
import { formatDate, formatDuration, formatTime } from '@/lib/utils';
import type { AttendanceSession } from '@/types';
import { useApp } from '@/context/AppContext';

const SUBJECT_COLORS = [
  '#22d3ee',
  '#34d399',
  '#f59e0b',
  '#60a5fa',
  '#fb7185',
  '#a78bfa',
];

interface Stats {
  totalStudents: number;
  activeStudents: number;
  totalSessions: number;
  totalRecords: number;
  todayRecords: number;
  todaySessionCount: number;
}

export function DashboardPage(): ReactNode {
  const { setPage } = useApp();
  const [stats, setStats] = useState<Stats | null>(null);
  const [weekly, setWeekly] = useState<{ date: string; count: number }[]>([]);
  const [subjects, setSubjects] = useState<{ subject: string; count: number }[]>([]);
  const [recent, setRecent] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, w, sub, r] = await Promise.all([
          fetchDashboardStats(),
          fetchWeeklyAttendance(),
          fetchSubjectDistribution(),
          fetchRecentSessions(5),
        ]);
        if (cancelled) return;
        setStats(s);
        setWeekly(w);
        setSubjects(sub);
        setRecent(r);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load dashboard data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <Card>
        <p className="text-sm text-rose-400">
          Could not load dashboard data: {error}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Students"
          value={loading ? '—' : stats?.totalStudents ?? 0}
          icon={<Users className="h-5 w-5" />}
          accent="cyan"
        />
        <StatCard
          label="Active Students"
          value={loading ? '—' : stats?.activeStudents ?? 0}
          icon={<CheckCircle2 className="h-5 w-5" />}
          accent="emerald"
        />
        <StatCard
          label="Today's Attendance"
          value={loading ? '—' : stats?.todayRecords ?? 0}
          icon={<CalendarCheck className="h-5 w-5" />}
          accent="amber"
        />
        <StatCard
          label="Total Sessions"
          value={loading ? '—' : stats?.totalSessions ?? 0}
          icon={<ClipboardList className="h-5 w-5" />}
          accent="blue"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Weekly Attendance Trend"
            subtitle="Attendance records over the past 7 days"
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <BarChart data={weekly.map((w) => ({ label: w.date, value: w.count }))} height={220} />
        </Card>

        <Card>
          <CardHeader
            title="By Subject"
            subtitle="Attendance distribution"
            icon={<ClipboardList className="h-4 w-4" />}
          />
          {subjects.length > 0 ? (
            <DonutChart
              data={subjects.map((s, i) => ({
                label: s.subject,
                value: s.count,
                color: SUBJECT_COLORS[i % SUBJECT_COLORS.length],
              }))}
              centerValue={subjects.reduce((sum, s) => sum + s.count, 0)}
              centerLabel="Records"
            />
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-slate-500">
              No attendance data yet
            </div>
          )}
        </Card>
      </div>

      {/* Today's summary + recent sessions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Today at a Glance"
            icon={<Clock className="h-4 w-4" />}
          />
          <div className="space-y-3">
            <SummaryRow
              label="Sessions today"
              value={stats?.todaySessionCount ?? 0}
            />
            <SummaryRow
              label="Records today"
              value={stats?.todayRecords ?? 0}
            />
            <SummaryRow
              label="Total records"
              value={stats?.totalRecords ?? 0}
            />
            <SummaryRow
              label="Avg per session"
              value={
                stats && stats.totalSessions > 0
                  ? Math.round(stats.totalRecords / stats.totalSessions)
                  : 0
              }
            />
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent Sessions"
            subtitle="Latest attendance sessions"
            icon={<History className="h-4 w-4" />}
            action={
              <button
                onClick={() => setPage('sessions')}
                className="text-xs font-medium text-cyan-400 hover:text-cyan-300"
              >
                View all
              </button>
            }
          />
          <div className="space-y-2">
            {recent.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No sessions recorded yet
              </p>
            ) : (
              recent.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-lg border border-slate-800/60 px-4 py-3 transition-colors hover:border-slate-700 hover:bg-slate-800/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800">
                      <ClipboardList className="h-4 w-4 text-cyan-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-200">
                        {session.subject}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDate(session.started_at)} · {formatTime(session.started_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-400">
                      {session.total_recognized} present
                    </span>
                    <Badge tone={session.status === 'completed' ? 'success' : 'warning'} dot>
                      {session.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }): ReactNode {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-slate-100">{value}</span>
    </div>
  );
}

