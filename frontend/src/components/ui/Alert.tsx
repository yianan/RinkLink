import type React from 'react';
import { cn } from '../../lib/cn';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

export type AlertProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: AlertVariant;
  title?: string;
};

const variants: Record<AlertVariant, string> = {
  info: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/35 dark:text-sky-100',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100',
  warning: 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100',
  error: 'border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100',
};

export function Alert({ className, variant = 'info', title, children, ...props }: AlertProps) {
  return (
    <div
      className={cn('rounded-xl border px-4 py-3 text-sm', variants[variant], className)}
      {...props}
    >
      {title && <div className="mb-1 font-semibold">{title}</div>}
      {children}
    </div>
  );
}
