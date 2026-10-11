import { AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react';
import clsx from 'clsx';

interface AlertProps {
  type: 'info' | 'warning' | 'success' | 'error';
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const config = {
  info: { icon: Info, bg: 'bg-sky-50/80 border-sky-200', text: 'text-sky-900', iconColor: 'text-sky-600' },
  warning: { icon: AlertTriangle, bg: 'bg-amber-50/80 border-amber-200', text: 'text-amber-900', iconColor: 'text-amber-600' },
  success: { icon: CheckCircle, bg: 'bg-emerald-50/80 border-emerald-200', text: 'text-emerald-900', iconColor: 'text-emerald-600' },
  error: { icon: XCircle, bg: 'bg-rose-50/80 border-rose-200', text: 'text-rose-900', iconColor: 'text-rose-600' },
};

export function Alert({ type, title, children, className }: AlertProps) {
  const { icon: Icon, bg, text, iconColor } = config[type];
  return (
    <div className={clsx('flex items-start gap-3 p-4 rounded-xl border text-sm', bg, text, className)}>
      <Icon className={clsx('w-5 h-5 shrink-0 mt-0.5', iconColor)} />
      <div className="flex-1">
        {title && <h4 className="font-semibold mb-0.5">{title}</h4>}
        <div className="text-xs leading-relaxed opacity-90">{children}</div>
      </div>
    </div>
  );
}

