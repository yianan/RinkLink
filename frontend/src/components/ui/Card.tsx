import type React from 'react';
import { cn } from '../../lib/cn';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-[color:var(--app-border-subtle)] bg-[var(--app-surface)] shadow-soft backdrop-blur-[1px] dark:shadow-[0_0_0_1px_rgba(148,163,184,0.08),0_1px_0_0_rgba(255,255,255,0.03)_inset,0_8px_24px_rgba(0,0,0,0.15)] dark:ring-1 dark:ring-[color:var(--app-border-subtle)]',
        className,
      )}
      {...props}
    />
  );
}
