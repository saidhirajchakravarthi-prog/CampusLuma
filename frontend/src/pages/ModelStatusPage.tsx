import { Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { useApi } from '../hooks/useApi';
import { api } from '../api/client';

export function ModelStatusPage() {
  const { data, loading, error, refetch } = useApi(() => api.getModelStatus(), []);
  const available = data?.status === 'trained';
  return (
    <div className="space-y-6">
      <Header title="Model Status" subtitle="Live model artifact availability and evaluation metadata from the backend" />
      {error && <Alert type="error" title="Model status unavailable">{error}</Alert>}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-indigo-50 p-2.5 text-indigo-700"><Activity className="h-5 w-5" /></span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Prediction artifact</h2>
              <p className="mt-1 text-xs text-slate-500">Status is checked from the running API.</p>
            </div>
          </div>
          <Badge variant={loading ? 'warning' : available ? 'success' : 'warning'}>
            {loading ? 'Checking' : available ? 'Available' : data?.status === 'not_trained' ? 'Not trained' : data?.status || 'Unknown'}
          </Badge>
        </div>
        {data?.note && <p className="mt-4 text-sm leading-6 text-slate-600">{data.note}</p>}
        {!loading && data?.metrics && <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Accuracy', data.metrics.accuracy],
            ['Balanced accuracy', data.metrics.balanced_accuracy],
            ['F1', data.metrics.f1],
            ['ROC AUC', data.metrics.roc_auc],
          ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 font-mono text-lg font-bold text-slate-900">{(Number(value) * 100).toFixed(1)}%</p>
          </div>)}
        </div>}
        {!loading && !data?.metrics && <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>No evaluation metrics are available from the backend. The interface does not estimate model health or fill missing measurements.</p>
        </div>}
        {available && data?.experimental && <p className="mt-4 flex items-start gap-2 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-xs leading-5 text-indigo-950">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Experimental evaluation on synthetic labels does not establish real-world student outcome accuracy.</span>
        </p>}
        <button type="button" onClick={refetch} disabled={loading} className="mt-5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Refresh status</button>
      </section>
    </div>
  );
}
