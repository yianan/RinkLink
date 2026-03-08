import React, { forwardRef } from 'react';
import { cn } from '../../lib/cn';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'block w-full resize-y rounded-lg border border-slate-200/80 bg-white/92 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-cyan-400 focus:ring-cyan-400 disabled:cursor-not-allowed disabled:border-slate-200/70 disabled:bg-slate-50/70 disabled:text-slate-500 dark:border-slate-700/80 dark:bg-slate-950/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:border-slate-800 dark:disabled:bg-slate-900/45',
        className,
      )}
      {...props}
    />
  );
});
