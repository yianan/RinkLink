import { Card } from './Card';
import { Skeleton } from './Skeleton';

export function TableSkeleton({
  columns = 5,
  rows = 4,
  compact = false,
}: {
  columns?: number;
  rows?: number;
  compact?: boolean;
}) {
  return (
    <Card className="overflow-hidden" aria-hidden="true">
      <div className="overflow-hidden">
        <div className="grid gap-px bg-slate-200/80 dark:bg-slate-800/70" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((_, index) => (
            <div key={`head:${index}`} className="bg-slate-50 px-4 py-3 dark:bg-slate-900/40">
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
          {Array.from({ length: rows * columns }).map((_, index) => (
            <div key={`cell:${index}`} className="bg-white px-4 py-3 dark:bg-slate-950/20">
              <Skeleton className={compact ? 'h-3 w-full' : 'h-4 w-full'} />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function CardListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} className="p-4">
          <div className="space-y-3">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-full" />
          </div>
        </Card>
      ))}
    </div>
  );
}
