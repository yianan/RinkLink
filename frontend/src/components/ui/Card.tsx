import type React from 'react';
import { cn } from '../../lib/cn';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-slate-200/70 bg-white/90 shadow-soft backdrop-blur-[1px] dark:border-slate-800/70 dark:bg-slate-950/55 dark:shadow-none dark:ring-1 dark:ring-slate-800/45',
        className,
      )}
      {...props}
    />
  );
}
