import type React from 'react';
import { cn } from '../../lib/cn';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-[color:var(--app-border-subtle)] bg-[var(--app-surface)] shadow-soft backdrop-blur-[1px] dark:shadow-none dark:ring-1 dark:ring-[color:var(--app-border-subtle)]',
        className,
      )}
      {...props}
    />
  );
}
