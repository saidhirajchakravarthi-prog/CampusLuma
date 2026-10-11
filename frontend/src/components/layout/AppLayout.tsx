import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '../../contexts/useAuth';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api/client';

export function AppLayout() {
  const location = useLocation();
  const { role } = useAuth();
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const isGuest = role === 'guest';
  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar />
      <div className="flex-1 min-w-0 transition-all duration-200 pl-0 md:pl-64 flex flex-col min-h-screen">
        <main className="flex-1 p-4 pt-16 sm:p-6 sm:pt-16 md:p-8 max-w-7xl w-full mx-auto">
          {isGuest && (
            <div role="status" className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-xs text-teal-950">
              <ShieldCheck className="h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
              <strong className="font-semibold">Guest Demo</strong>
              <span>Explore all features using isolated synthetic data. Changes stay in this demo workspace.</span>
              <button type="button" disabled={resetting} onClick={async () => {
                if (!window.confirm('Restore the guest sandbox to its starting synthetic dataset? This clears demo imports and interventions.')) return;
                setResetting(true);
                setResetError(null);
                try {
                  await api.restoreDemoWorkspace();
                  window.location.assign('/');
                } catch (error) {
                  setResetError(error instanceof Error ? error.message : 'Could not restore the demo workspace.');
                  setResetting(false);
                }
              }} className="ml-auto rounded-lg border border-teal-300 px-2.5 py-1 text-[11px] font-semibold text-teal-900 hover:bg-teal-100 disabled:opacity-60">
                {resetting ? 'Restoring…' : 'Restore demo data'}
              </button>
            </div>
          )}
          {isGuest && resetError && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{resetError}</p>}
          <div key={location.pathname} className="motion-safe:animate-[siq-card-in_.28s_ease-out_both]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
