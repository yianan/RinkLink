import type React from 'react';
import { cn } from '../../lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 disabled:pointer-events-none disabled:opacity-50';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-brand-600 to-fuchsia-600 text-white shadow-soft hover:from-brand-500 hover:to-fuchsia-500 hover:shadow-md',
  secondary: 'bg-slate-900 text-white shadow-soft hover:bg-slate-800 hover:shadow-md',
  outline:
    'border border-slate-200/80 bg-white/70 text-slate-900 shadow-sm hover:border-brand-200/80 hover:bg-brand-50/80 hover:text-brand-900',
  ghost: 'text-slate-800 hover:bg-slate-100/80',
  destructive: 'bg-rose-600 text-white shadow-soft hover:bg-rose-500 hover:shadow-md',
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
