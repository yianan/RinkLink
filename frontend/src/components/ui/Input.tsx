import React, { forwardRef } from 'react';
import { cn } from '../../lib/cn';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        'block w-full rounded-lg border border-[color:var(--app-border-subtle)] bg-[var(--app-surface-strong)] px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-cyan-400 focus:ring-[color:var(--app-focus-ring)] disabled:cursor-not-allowed disabled:border-[color:var(--app-border-subtle)] disabled:bg-[var(--app-disabled-surface)] disabled:text-[color:var(--app-disabled-text)] dark:text-slate-100 dark:placeholder:text-slate-500',
        className,
      )}
      {...props}
    />
  );
});
