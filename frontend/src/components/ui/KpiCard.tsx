import { LucideIcon } from 'lucide-react';
import clsx from 'clsx';

interface KpiCardProps {
  title: string;
  value: string | number | null;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  loading?: boolean;
  unavailable?: boolean;
}

export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = 'text-indigo-600',
  loading = false,
  unavailable = false,
}: KpiCardProps) {
  return (
    <div className="cl-card p-5 motion-safe:animate-[siq-card-in_.35s_ease-out_both]">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex-1 min-w-0 pr-3">
          <p className="text-xs font-semibold uppercase tracking-wider leading-snug text-slate-500">{title}</p>
          {loading ? (
            <div className="mt-2 h-8 w-24 bg-slate-200 rounded animate-pulse" />
          ) : unavailable || value === null || value === undefined ? (
            <p className="mt-1 text-xl font-bold text-slate-400 break-words">Unavailable</p>
          ) : (
            <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-slate-900 break-words">{value}</p>
          )}
          {subtitle && !loading && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div className={clsx('shrink-0 p-2 rounded-xl bg-slate-50 border border-slate-100', iconColor)}>
          <Icon className="w-5 h-5 shrink-0" />
        </div>
      </div>
    </div>
  );
}

