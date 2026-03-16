import type { ReactNode } from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
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
  const selectedValue = String(value);

  return (
    <ToggleGroup.Root
      type="single"
      value={selectedValue}
      onValueChange={(nextValue) => {
        const nextItem = items.find((item) => String(item.value) === nextValue);
        if (nextItem) onChange(nextItem.value);
      }}
      className={cn(
        'inline-flex flex-wrap rounded-xl border border-[color:var(--app-border-subtle)] bg-[var(--app-surface)] p-1 shadow-sm backdrop-blur-[1px]',
        className,
      )}
    >
      {items.map((item) => (
        <ToggleGroup.Item
          key={String(item.value)}
          value={String(item.value)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors data-[state=on]:bg-[var(--app-surface-strong)] data-[state=on]:text-slate-900 data-[state=on]:shadow-sm data-[state=on]:ring-1 data-[state=on]:ring-[color:var(--app-border-subtle)] dark:data-[state=on]:text-slate-100',
            'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
            itemClassName,
          )}
        >
          {item.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
