import type { ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { filterButtonClass } from '../lib/uiClasses';

type FilterPanelTriggerProps = {
  count: number;
  onClick?: () => void;
};

type FilterPanelProps = {
  open: boolean;
  badges: string[];
  onClear: () => void;
  children: ReactNode;
  title: string;
  description: string;
};

export function FilterPanelTrigger({ count, onClick }: FilterPanelTriggerProps) {
  return (
    <Button type="button" variant="outline" size="sm" className={filterButtonClass} onClick={onClick}>
      <SlidersHorizontal className="h-4 w-4" />
      Filters
      {count > 0 ? ` (${count})` : ''}
    </Button>
  );
}

export function FilterPanel({ open, badges, onClear, children, title, description }: FilterPanelProps) {
  const hasActiveFilters = badges.length > 0;

  return (
    <>
      {hasActiveFilters && !open ? (
        <div className="flex flex-wrap items-center gap-2">
          {badges.map((label, index) => (
            <Badge key={`${label}:${index}`} variant="outline" className="bg-white/80 dark:bg-slate-950/35">
              {label}
            </Badge>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            Clear all
          </Button>
        </div>
      ) : null}

      {open ? (
        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">{description}</div>
            </div>
            {hasActiveFilters ? (
              <Button type="button" variant="ghost" size="sm" onClick={onClear}>
                Clear all
              </Button>
            ) : null}
          </div>

          {hasActiveFilters ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {badges.map((label, index) => (
                <Badge key={`${label}:${index}`} variant="outline" className="bg-white/80 dark:bg-slate-950/35">
                  {label}
                </Badge>
              ))}
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 border-t border-[color:var(--app-border-subtle)] pt-4 xl:grid-cols-2">
            {children}
          </div>
        </Card>
      ) : null}
    </>
  );
}
