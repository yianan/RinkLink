import type React from 'react';
import { cn } from '../../lib/cn';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-slate-200/60 bg-white shadow-soft dark:border-slate-800/60 dark:bg-slate-950/40 dark:shadow-none dark:ring-1 dark:ring-slate-800/40',
        className,
      )}
      {...props}
    />
  );
}
