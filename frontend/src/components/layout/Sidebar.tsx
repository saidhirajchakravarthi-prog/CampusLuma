import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';
import {
  LayoutDashboard,
  Users,
  AlertTriangle,
  BarChart3,
  UploadCloud,
  ClipboardList,
  Sparkles,
  FileSpreadsheet,
  Activity,
  ChevronLeft,
  ChevronRight,
  LogOut,
  ShieldCheck,
  Menu,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import campusLumaMark from '../../assets/campusluma-mark.svg';

const navItems = [
  {
    to: '/',
    label: 'Overview',
    icon: LayoutDashboard,
    roles: ['guest', 'viewer', 'analyst', 'staff', 'admin'],
  },
  {
    to: '/students',
    label: 'Directory',
    icon: Users,
    roles: ['guest', 'staff', 'admin'],
  },
  {
    to: '/at-risk',
    label: 'Early Warning',
    icon: AlertTriangle,
    roles: ['guest', 'staff', 'admin'],
  },
  {
    to: '/analytics',
    label: 'Analytics',
    icon: BarChart3,
    roles: ['guest', 'viewer', 'analyst', 'staff', 'admin'],
  },
  {
    to: '/imports',
    label: 'Data Import',
    icon: UploadCloud,
    roles: ['guest', 'staff', 'admin'],
  },
  {
    to: '/interventions',
    label: 'Interventions',
    icon: ClipboardList,
    roles: ['guest', 'staff', 'admin'],
  },
  {
    to: '/predictions',
    label: 'Predictions',
    icon: Sparkles,
    roles: ['guest', 'viewer', 'analyst', 'staff', 'admin'],
  },
  {
    to: '/model-status',
    label: 'Model Status',
    icon: Activity,
    roles: ['guest', 'viewer', 'analyst', 'staff', 'admin'],
  },
  {
    to: '/reports',
    label: 'Reports',
    icon: FileSpreadsheet,
    roles: ['guest', 'staff', 'admin'],
  },
];

export function Sidebar() {
  const { role, user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const allowedItems = navItems.filter((item) => !role || item.roles.includes(role));

  return (
    <>
    <button
      type="button"
      onClick={() => setMobileOpen(!mobileOpen)}
      aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
      aria-expanded={mobileOpen}
      className="fixed left-4 top-3 z-[60] inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-[#0b1329] text-white shadow-lg md:hidden"
    >
      {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
    </button>
    {mobileOpen && <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation menu" className="fixed inset-0 z-30 bg-slate-950/50 md:hidden" />}
    <aside
      className={clsx(
        'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-[#0b1329] border-r border-slate-800 transition-all duration-200 select-none md:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        collapsed ? 'md:w-18' : 'md:w-64'
      )}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#111d3b] border border-indigo-300/20 shadow-sm shrink-0">
            <img src={campusLumaMark} alt="CampusLuma" className="w-9 h-9" />
          </div>
          {!collapsed && (
            <div className="flex flex-col truncate">
              <span className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                CampusLuma
                <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                  AI
                </span>
              </span>
              <span className="text-[11px] text-slate-400 truncate">Illuminate Student Success.</span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {allowedItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              aria-label={item.label}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors relative',
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                )
              }
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-4.5 h-4.5 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* User Context & Actions */}
      <div className="p-3 border-t border-slate-800/80 space-y-2">
        {!collapsed && (user || role) && (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="w-7 h-7 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-slate-200 truncate">
                {user?.name || (role ? `${role.charAt(0).toUpperCase() + role.slice(1)} User` : 'Authenticated')}
              </span>
              <span className="text-[10px] text-slate-400 truncate font-mono">
                {user?.email || (role ? `${role} role` : 'Active session')}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-1 pt-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors w-full cursor-pointer"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <div className="hidden md:flex items-center gap-2 text-xs w-full px-1">
                <ChevronLeft className="w-4 h-4" />
                <span>Collapse Sidebar</span>
              </div>
                <ChevronLeft className="w-4 h-4 md:hidden" />
              </>
            )}
          </button>
        </div>

        <button
          onClick={logout}
          className={clsx(
            'flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition-colors w-full cursor-pointer',
            collapsed && 'justify-center'
          )}
          title="Sign Out"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
    </>
  );
}
