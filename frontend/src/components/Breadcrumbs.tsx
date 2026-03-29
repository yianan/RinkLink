import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/cn';
import { subtleLinkClass } from '../lib/uiClasses';

type BreadcrumbItem = {
  label: string;
  to?: string;
};

export default function Breadcrumbs({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center gap-1 text-sm', className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}:${index}`} className="flex items-center gap-1">
            {item.to && !isLast ? (
              <Link
                to={item.to}
                className={cn('text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100', subtleLinkClass)}
              >
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? 'font-medium text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}>
                {item.label}
              </span>
            )}
            {!isLast ? <ChevronRight className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" /> : null}
          </span>
        );
      })}
    </nav>
  );
}
