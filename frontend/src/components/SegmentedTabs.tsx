import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

type TabValue = string | number;

type SegmentedTabItem<T extends TabValue> = {
  label: ReactNode;
  value: T;
};

type SegmentedTabsProps<T extends TabValue> = {
  items: SegmentedTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  itemClassName?: string;
};

export default function SegmentedTabs<T extends TabValue>({
  items,
  value,
  onChange,
  className,
  itemClassName,
}: SegmentedTabsProps<T>) {
  return (
    <div
      className={cn(
        'inline-flex flex-wrap rounded-xl border border-[color:var(--app-border-subtle)] bg-[var(--app-surface)] p-1 shadow-sm backdrop-blur-[1px]',
        className,
      )}
    >
      {items.map((item) => (
        <button
          key={String(item.value)}
          type="button"
          onClick={() => onChange(item.value)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            value === item.value
              ? 'bg-[var(--app-surface-strong)] text-slate-900 shadow-sm ring-1 ring-[color:var(--app-border-subtle)] dark:text-slate-100'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
            itemClassName,
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
