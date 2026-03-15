import React, { forwardRef } from 'react';
import { cn } from '../../lib/cn';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        'block min-h-10 w-full rounded-lg border border-[color:var(--app-border-subtle)] bg-[var(--app-surface-strong)] py-2 pl-3 pr-10 text-sm text-slate-900 shadow-sm focus:border-cyan-400 focus:ring-[color:var(--app-focus-ring)] disabled:cursor-not-allowed disabled:border-[color:var(--app-border-subtle)] disabled:bg-[var(--app-disabled-surface)] disabled:text-[color:var(--app-disabled-text)] dark:text-slate-100',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
