import type { ReactNode } from 'react';
import { Card } from './ui/Card';

export default function EmptyState({
  icon,
  title,
  description,
  actions,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className ?? 'px-6 py-10'}>
      <div className="mx-auto flex max-w-xl flex-col items-center text-center">
        {icon ? (
          <div className="relative mb-4">
            <div className="absolute inset-0 -m-1 rounded-2xl bg-gradient-to-br from-cyan-200/30 via-transparent to-violet-200/30 blur-md dark:from-cyan-500/10 dark:to-violet-500/10" />
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 text-slate-500 ring-1 ring-slate-200/60 dark:from-slate-800/80 dark:to-slate-900/80 dark:text-slate-400 dark:ring-slate-700/50">
              {icon}
            </div>
          </div>
        ) : null}
        <div className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</div>
        <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">{description}</div>
        {actions ? <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div> : null}
      </div>
    </Card>
  );
}
