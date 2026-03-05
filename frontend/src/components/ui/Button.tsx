import type React from 'react';
import { cn } from '../../lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-slate-950 disabled:pointer-events-none disabled:cursor-not-allowed disabled:shadow-none';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-cyan-600 via-sky-600 to-violet-600 text-white shadow-soft hover:from-cyan-500 hover:via-sky-500 hover:to-violet-500 hover:shadow-md disabled:border disabled:border-slate-200/70 disabled:from-slate-200 disabled:via-slate-200 disabled:to-slate-200 disabled:text-slate-500 dark:from-cyan-400 dark:via-sky-400 dark:to-violet-400 dark:text-slate-950 dark:shadow-[0_0_0_1px_rgba(34,211,238,0.22),0_10px_28px_rgba(34,211,238,0.10)] dark:hover:from-cyan-300 dark:hover:via-sky-300 dark:hover:to-violet-300 dark:disabled:border-slate-700/70 dark:disabled:from-slate-800 dark:disabled:via-slate-800 dark:disabled:to-slate-800 dark:disabled:text-slate-400',
  secondary:
    'bg-slate-900 text-white shadow-soft hover:bg-slate-800 hover:shadow-md disabled:border disabled:border-slate-200/70 disabled:bg-slate-200 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white dark:disabled:border-slate-700/70 dark:disabled:bg-slate-800 dark:disabled:text-slate-400',
  outline:
    'border border-slate-200/80 bg-white/70 text-slate-900 shadow-sm hover:border-cyan-400/50 hover:bg-slate-50 hover:text-slate-950 hover:ring-1 hover:ring-cyan-400/15 disabled:border-slate-200/70 disabled:bg-slate-50/60 disabled:text-slate-500 dark:border-slate-700/80 dark:bg-slate-950/30 dark:text-slate-100 dark:hover:border-cyan-400/40 dark:hover:bg-slate-900/40 dark:hover:ring-cyan-400/15 dark:disabled:border-slate-700/50 dark:disabled:bg-slate-950/20 dark:disabled:text-slate-500',
  ghost:
    'text-slate-800 hover:bg-slate-100/80 disabled:text-slate-400 dark:text-slate-200 dark:hover:bg-slate-800/50 dark:disabled:text-slate-500',
  destructive:
    'bg-rose-600 text-white shadow-soft hover:bg-rose-500 hover:shadow-md disabled:border disabled:border-rose-200/70 disabled:bg-rose-200 disabled:text-rose-700 dark:disabled:border-rose-900/50 dark:disabled:bg-rose-900/40 dark:disabled:text-rose-200',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-base',
  icon: 'h-10 w-10',
};

export function Button({ className, variant = 'primary', size = 'md', ...props }: ButtonProps) {
  const ariaLabel = typeof props['aria-label'] === 'string' ? props['aria-label'] : undefined;
  const tooltip = props.title ?? ariaLabel;
  const showTooltip = size === 'icon' && !!tooltip;
  const title = showTooltip ? tooltip : props.title;

  return (
    <button
      className={cn(base, variants[variant], sizes[size], showTooltip && 'rl-tooltip', className)}
      {...props}
      data-tooltip={showTooltip ? tooltip : undefined}
      title={title}
    />
  );
}
