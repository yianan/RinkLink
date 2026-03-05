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
        'block w-full rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-10 text-sm text-slate-900 shadow-sm focus:border-cyan-400 focus:ring-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-100 dark:disabled:bg-slate-900/40',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
