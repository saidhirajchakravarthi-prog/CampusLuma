import { FlaskConical } from 'lucide-react';

export function SyntheticDataBanner({ guest = false }: { guest?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50/90 border border-amber-200/90 rounded-xl text-amber-900 text-xs shadow-2xs">
      <div className="p-1.5 rounded-lg bg-amber-100/80 text-amber-800 shrink-0">
        <FlaskConical className="w-4 h-4" />
      </div>
      <div>
        {guest ? <><span className="font-semibold text-amber-950">Guest Demo Sandbox:</span> This view uses only explicitly synthetic records from the isolated demo workspace. Score weights and risk thresholds are prototype assumptions, not validated predictions.</> : <><span className="font-semibold text-amber-950">Development Prototype Notice:</span> The development generator marks its rows
        <code className="mx-1 font-mono">SYNTHETIC_DEVELOPMENT_ONLY</code>. Imported rows may have another or unspecified origin;
        check each profile’s origin and source. Score weights and risk thresholds are prototype assumptions, not validated predictions.</>}
      </div>
    </div>
  );
}
