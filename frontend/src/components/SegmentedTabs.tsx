import type { ReactNode } from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { cn } from '../lib/cn';
import { segmentedControlClass, segmentedControlItemClass } from '../lib/uiClasses';

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
      className={cn(segmentedControlClass, className)}
    >
      {items.map((item) => (
        <ToggleGroup.Item
          key={String(item.value)}
          value={String(item.value)}
          className={cn(
            segmentedControlItemClass,
            itemClassName,
          )}
        >
          {item.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
