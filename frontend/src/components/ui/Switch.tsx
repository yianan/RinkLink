import type React from 'react';
import { cn } from '../../lib/cn';

export type SwitchProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label?: string;
};

export function Switch({ className, checked, disabled, onChange, label, ...props }: SwitchProps) {
  return (
    <label className={cn('inline-flex items-center gap-2', disabled && 'opacity-50', className)}>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        {...props}
      />
      <span className="relative h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-cyan-400 peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-400 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-slate-50 peer-disabled:cursor-not-allowed dark:bg-slate-800 dark:peer-focus-visible:ring-offset-slate-950">
        <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
      </span>
      {label && <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>}
    </label>
  );
}
