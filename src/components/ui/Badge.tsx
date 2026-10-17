import { type ReactNode } from 'react';
import { classNames } from '@/lib/utils';


type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'cyan';


interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}


const toneClasses: Record<Tone, string> = {
  neutral: 'bg-slate-800 text-slate-300 border-slate-700',
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  danger: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  info: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
};


const dotClasses: Record<Tone, string> = {
  neutral: 'bg-slate-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  danger: 'bg-rose-400',
  info: 'bg-blue-400',
  cyan: 'bg-cyan-400',
};


export function Badge({ children, tone = 'neutral', dot, className }: BadgeProps) {
  return (
    <span
      className={classNames(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        toneClasses[tone],
        className
      )}
    >
      {dot && (
        <span
          className={classNames(
            'h-1.5 w-1.5 rounded-full',
            dotClasses[tone]
          )}
        />
      )}
      {children}
    </span>
  );
}

