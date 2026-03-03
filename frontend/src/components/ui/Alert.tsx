import type React from 'react';
import { cn } from '../../lib/cn';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

export type AlertProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: AlertVariant;
  title?: string;
};

const variants: Record<AlertVariant, string> = {
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-950',
  error: 'border-rose-200 bg-rose-50 text-rose-950',
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

