import type React from 'react';
import { cn } from '../../lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-slate-950 disabled:pointer-events-none disabled:cursor-not-allowed disabled:shadow-none';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-cyan-600 via-sky-600 to-violet-600 text-white shadow-soft hover:from-cyan-500 hover:via-sky-500 hover:to-violet-500 hover:shadow-md disabled:border disabled:border-[color:var(--app-border-subtle)] disabled:from-[var(--app-disabled-surface)] disabled:via-[var(--app-disabled-surface)] disabled:to-[var(--app-disabled-surface)] disabled:text-[color:var(--app-disabled-text)] dark:text-slate-950 dark:shadow-[0_0_0_1px_rgba(34,211,238,0.22),0_12px_30px_rgba(34,211,238,0.12)] dark:hover:from-cyan-300 dark:hover:via-sky-300 dark:hover:to-violet-300',
  secondary:
    'bg-slate-900 text-white shadow-soft hover:bg-slate-800 hover:shadow-md disabled:border disabled:border-[color:var(--app-border-subtle)] disabled:bg-[var(--app-disabled-surface)] disabled:text-[color:var(--app-disabled-text)] dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white',
  outline:
    'border border-slate-300/90 bg-white/95 text-slate-800 shadow-sm backdrop-blur-[1px] hover:border-sky-400 hover:bg-sky-50 hover:text-sky-900 hover:ring-1 hover:ring-sky-400/20 disabled:border-[color:var(--app-border-subtle)] disabled:bg-[var(--app-disabled-surface)] disabled:text-[color:var(--app-disabled-text)] dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:hover:border-sky-400 dark:hover:bg-sky-950/40 dark:hover:text-sky-100 dark:hover:ring-sky-400/25',
  ghost:
    'text-slate-800 hover:bg-[var(--app-surface)] disabled:text-[color:var(--app-disabled-text)] dark:text-slate-200 dark:hover:bg-[var(--app-surface)]',
  destructive:
    'bg-rose-600 text-white shadow-soft hover:bg-rose-500 hover:shadow-md disabled:border disabled:border-rose-200/70 disabled:bg-[color:color-mix(in_srgb,var(--app-disabled-surface)_84%,rgb(251_191_191))] disabled:text-rose-700 dark:disabled:text-rose-200',
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
