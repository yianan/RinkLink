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
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
            {icon}
          </div>
        ) : null}
        <div className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</div>
        <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">{description}</div>
        {actions ? <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div> : null}
      </div>
    </Card>
  );
}
