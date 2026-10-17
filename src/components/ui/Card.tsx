import { type ReactNode } from 'react';
import { classNames } from '@/lib/utils';


interface CardProps {
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}


export function Card({ children, className, noPadding }: CardProps) {
  return (
    <div
      className={classNames(
        'rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm',
        noPadding ? '' : 'p-6',
        className
      )}
    >
      {children}
    </div>
  );
}


interface CardHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
}


export function CardHeader({ title, subtitle, icon, action }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-cyan-400">
            {icon}
          </div>
        )}
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

