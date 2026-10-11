import React from 'react';
import clsx from 'clsx';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'indigo' | 'teal';
  size?: 'sm' | 'md';
}

const variants = {
  default: 'bg-slate-100 text-slate-700 border-slate-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-rose-50 text-rose-700 border-rose-200',
  info: 'bg-sky-50 text-sky-700 border-sky-200',
  neutral: 'bg-slate-50 text-slate-600 border-slate-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  teal: 'bg-teal-50 text-teal-700 border-teal-200',
};

export function Badge({ children, variant = 'default', size = 'sm' }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center font-medium rounded-md border',
        variants[variant],
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
      )}
    >
      {children}
    </span>
  );
}

export function RiskBadge({ level }: { level: string }) {
  const variant = level === 'High Risk' ? 'danger' : level === 'Medium Risk' ? 'warning' : level === 'Low Risk' ? 'success' : 'neutral';
  return <Badge variant={variant}>{level}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'Completed'
      ? 'success'
      : status === 'In Progress'
      ? 'indigo'
      : status === 'Cancelled'
      ? 'neutral'
      : 'warning';
  return <Badge variant={variant}>{status}</Badge>;
}
