import clsx from 'clsx';

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse bg-slate-200/80 rounded-md', className)} />;
}

export function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
      <Skeleton className="h-4 w-24 mb-3" />
      <Skeleton className="h-8 w-20 mb-2" />
      <Skeleton className="h-3 w-36" />
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-xs">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="p-4 space-y-3">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 py-2 border-b border-slate-50 last:border-0">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={clsx('h-4', c === 0 ? 'w-24' : c === 1 ? 'w-40' : 'w-20')} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
      <Skeleton className="h-5 w-44 mb-6" />
      <div className="h-64 flex items-end gap-3 justify-center">
        <Skeleton className="h-32 w-12" />
        <Skeleton className="h-48 w-12" />
        <Skeleton className="h-24 w-12" />
        <Skeleton className="h-56 w-12" />
        <Skeleton className="h-40 w-12" />
      </div>
    </div>
  );
}
