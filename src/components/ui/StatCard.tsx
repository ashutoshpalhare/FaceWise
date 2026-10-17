import { type ReactNode } from 'react';
import { classNames } from '@/lib/utils';


interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  trend?: { value: string; positive: boolean };
  accent?: 'cyan' | 'emerald' | 'amber' | 'blue' | 'rose';
}


const accentClasses = {
  cyan: 'text-cyan-400 bg-cyan-500/10',
  emerald: 'text-emerald-400 bg-emerald-500/10',
  amber: 'text-amber-400 bg-amber-500/10',
  blue: 'text-blue-400 bg-blue-500/10',
  rose: 'text-rose-400 bg-rose-500/10',
};


export function StatCard({
  label,
  value,
  icon,
  trend,
  accent = 'cyan',
}: StatCardProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm transition-colors hover:border-slate-700">
      <div className="flex items-center justify-between">
        <div
          className={classNames(
            'flex h-10 w-10 items-center justify-center rounded-lg',
            accentClasses[accent]
          )}
        >
          {icon}
        </div>
        {trend && (
          <span
            className={classNames(
              'text-xs font-medium',
              trend.positive ? 'text-emerald-400' : 'text-rose-400'
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
      <p className="mt-4 text-3xl font-bold tracking-tight text-slate-100">
        {value}
      </p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </div>
  );
}

