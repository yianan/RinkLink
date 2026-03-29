import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { cn } from '../lib/cn';
import { selectorPillActiveClass, selectorPillClass, selectorPillIdleClass } from '../lib/uiClasses';

export type FilterOption = {
  value: string;
  label: string;
};

export type FilterGroupTone = 'sky' | 'violet' | 'emerald' | 'amber';

function filterToneClasses(tone: FilterGroupTone) {
  switch (tone) {
    case 'sky':
      return {
        label: 'border-sky-200/80 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/25 dark:text-sky-200',
        pill: 'hover:border-sky-300 hover:text-sky-900 dark:hover:border-sky-500/60 dark:hover:text-sky-100',
        selected: 'border-sky-400 bg-sky-500 text-white shadow-sm dark:border-sky-300 dark:bg-sky-400 dark:text-slate-950',
      };
    case 'violet':
      return {
        label: 'border-violet-200/80 bg-violet-50 text-violet-800 dark:border-violet-900/60 dark:bg-violet-950/25 dark:text-violet-200',
        pill: 'hover:border-violet-300 hover:text-violet-900 dark:hover:border-violet-500/60 dark:hover:text-violet-100',
        selected: 'border-violet-400 bg-violet-500 text-white shadow-sm dark:border-violet-300 dark:bg-violet-400 dark:text-slate-950',
      };
    case 'emerald':
      return {
        label: 'border-emerald-200/80 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200',
        pill: 'hover:border-emerald-300 hover:text-emerald-900 dark:hover:border-emerald-500/60 dark:hover:text-emerald-100',
        selected: 'border-emerald-400 bg-emerald-500 text-white shadow-sm dark:border-emerald-300 dark:bg-emerald-400 dark:text-slate-950',
      };
    case 'amber':
      return {
        label: 'border-amber-200/80 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-200',
        pill: 'hover:border-amber-300 hover:text-amber-900 dark:hover:border-amber-500/60 dark:hover:text-amber-100',
        selected: 'border-amber-400 bg-amber-500 text-white shadow-sm dark:border-amber-300 dark:bg-amber-400 dark:text-slate-950',
      };
  }
}

type FilterPillGroupProps = {
  label: string;
  options: FilterOption[];
  values: string[];
  onChange: (values: string[]) => void;
  tone: FilterGroupTone;
};

export default function FilterPillGroup({
  label,
  options,
  values,
  onChange,
  tone,
}: FilterPillGroupProps) {
  const toneClasses = filterToneClasses(tone);

  return (
    <div className="space-y-2">
      <div
        className={cn(
          'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]',
          toneClasses.label,
        )}
      >
        {label}
      </div>
      <ToggleGroup.Root type="multiple" value={values} onValueChange={onChange} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = values.includes(option.value);
          return (
            <ToggleGroup.Item
              key={option.value}
              value={option.value}
              className={cn(
                selectorPillClass,
                selected
                  ? toneClasses.selected
                  : cn(
                    selectorPillIdleClass,
                    toneClasses.pill,
                  ),
                selected && selectorPillActiveClass,
              )}
            >
              {option.label}
            </ToggleGroup.Item>
          );
        })}
      </ToggleGroup.Root>
    </div>
  );
}
