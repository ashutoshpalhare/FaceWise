import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { classNames } from '@/lib/utils';


type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';


interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
}


const variantClasses: Record<Variant, string> = {
  primary:
    'bg-cyan-500 text-slate-950 hover:bg-cyan-400 active:bg-cyan-600 shadow-lg shadow-cyan-500/20',
  secondary:
    'bg-slate-800 text-slate-100 hover:bg-slate-700 active:bg-slate-950 border border-slate-700',
  ghost: 'text-slate-300 hover:bg-slate-800 hover:text-slate-100',
  danger:
    'bg-rose-500/90 text-white hover:bg-rose-500 active:bg-rose-600 shadow-lg shadow-rose-500/20',
  outline:
    'border border-slate-700 text-slate-200 hover:border-slate-600 hover:bg-slate-800/50',
};


const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
};


export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  children,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={classNames(
        'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}

