import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export default function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0 flex-1">
        <div className="font-display text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-slate-100">{title}</div>
        {subtitle ? <div className="text-sm text-slate-600 dark:text-slate-400">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{actions}</div> : null}
    </div>
  );
}
