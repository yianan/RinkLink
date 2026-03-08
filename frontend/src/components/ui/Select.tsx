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
        'block w-full rounded-lg border border-slate-200/80 bg-white/92 py-2 pl-3 pr-10 text-sm text-slate-900 shadow-sm focus:border-cyan-400 focus:ring-cyan-400 disabled:cursor-not-allowed disabled:border-slate-200/70 disabled:bg-slate-50/70 disabled:text-slate-500 dark:border-slate-700/80 dark:bg-slate-950/60 dark:text-slate-100 dark:disabled:border-slate-800 dark:disabled:bg-slate-900/45',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
