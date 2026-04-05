import type React from 'react';
import { cn } from '../../lib/cn';
import { Tooltip } from './Tooltip';

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-slate-950 disabled:pointer-events-none disabled:cursor-not-allowed disabled:shadow-none';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-cyan-600 via-sky-600 to-violet-600 text-white shadow-soft hover:from-cyan-500 hover:via-sky-500 hover:to-violet-500 hover:shadow-md disabled:border disabled:border-[color:var(--app-border-subtle)] disabled:from-[var(--app-disabled-surface)] disabled:via-[var(--app-disabled-surface)] disabled:to-[var(--app-disabled-surface)] disabled:text-[color:var(--app-disabled-text)] dark:from-cyan-400 dark:via-sky-400 dark:to-violet-400 dark:text-slate-950 dark:shadow-[0_0_0_1px_rgba(34,211,238,0.22),0_12px_30px_rgba(34,211,238,0.15)] dark:hover:from-cyan-300 dark:hover:via-sky-300 dark:hover:to-violet-300 dark:hover:shadow-[0_0_0_1px_rgba(34,211,238,0.3),0_12px_30px_rgba(34,211,238,0.2)]',
  outline:
    'border border-slate-300/90 bg-white/95 text-slate-800 shadow-sm backdrop-blur-[1px] hover:border-[color:var(--app-accent-link)]/35 hover:bg-[color:color-mix(in_srgb,var(--app-accent-link)_8%,white)] hover:text-[color:var(--app-accent-link-hover)] hover:ring-1 hover:ring-[color:var(--app-accent-link)]/15 disabled:border-[color:var(--app-border-subtle)] disabled:bg-[var(--app-disabled-surface)] disabled:text-[color:var(--app-disabled-text)] dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:hover:border-[color:var(--app-accent-link)]/45 dark:hover:bg-[color:color-mix(in_srgb,var(--app-accent-link)_14%,transparent)] dark:hover:text-[color:var(--app-accent-link)] dark:hover:ring-[color:var(--app-accent-link)]/20',
  ghost:
    'text-slate-700 hover:bg-[color:color-mix(in_srgb,var(--app-accent-link)_6%,white)] hover:text-[color:var(--app-accent-link-hover)] disabled:text-[color:var(--app-disabled-text)] dark:text-slate-200 dark:hover:bg-[color:color-mix(in_srgb,var(--app-accent-link)_10%,transparent)] dark:hover:text-[color:var(--app-accent-link)]',
  destructive:
    'bg-rose-600 text-white shadow-soft ring-1 ring-transparent hover:bg-rose-700 hover:ring-rose-300/35 hover:shadow-md disabled:border disabled:border-rose-200/70 disabled:bg-[color:color-mix(in_srgb,var(--app-disabled-surface)_84%,rgb(251_191_191))] disabled:text-rose-700 dark:bg-rose-500 dark:hover:bg-rose-600 dark:hover:ring-rose-400/30 dark:disabled:text-rose-200',
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
  const title = showTooltip ? undefined : props.title;

  const button = (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
      title={title}
    />
  );

  if (!showTooltip || props.disabled) return button;

  return <Tooltip content={tooltip}>{button}</Tooltip>;
}
