import React from 'react';
import { useAuth } from '../../contexts/useAuth';
import { Badge } from '../ui/Badge';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import academicHero from '../../assets/academic-hero.svg';
import studentsArt from '../../assets/students-header.svg';
import insightArt from '../../assets/insight-header.svg';
import supportArt from '../../assets/support-header.svg';
import dataArt from '../../assets/data-header.svg';
import reportsArt from '../../assets/reports-header.svg';

interface Breadcrumb {
  label: string;
  to?: string;
}

interface HeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: React.ReactNode;
}

export function Header({ title, subtitle, breadcrumbs, actions }: HeaderProps) {
  const { role, user } = useAuth();
  const titleKey = title.toLowerCase();
  const artwork = titleKey.includes('overview') ? academicHero
    : titleKey.includes('student') || titleKey.includes('profile') || titleKey.includes('directory') ? studentsArt
      : titleKey.includes('risk') || titleKey.includes('warning') || titleKey.includes('intervention') ? supportArt
        : titleKey.includes('import') ? dataArt
          : titleKey.includes('report') || titleKey.includes('export') ? reportsArt
            : titleKey.includes('analytics') || titleKey.includes('prediction') || titleKey.includes('model') ? insightArt
              : null;
  const illustrated = Boolean(artwork);

  return (
    <header className={illustrated
      ? 'relative isolate mb-6 flex min-h-36 flex-col justify-between gap-4 overflow-hidden rounded-3xl border border-indigo-300/15 bg-[#0b1329] px-5 py-5 text-white shadow-lg shadow-indigo-950/10 sm:min-h-40 sm:px-7 sm:py-6 lg:flex-row lg:items-center'
      : 'mb-6 flex flex-col gap-3 border-b border-slate-200/60 pb-4 sm:flex-row sm:items-center sm:justify-between'}>
      {artwork && <>
        <img src={artwork} alt="" aria-hidden="true" className="pointer-events-none absolute right-1 top-1/2 z-[-1] h-36 w-[48%] -translate-y-1/2 object-contain object-right opacity-35 sm:right-4 sm:h-44 lg:h-52 lg:w-[40%]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-[#0b1329] via-[#0b1329]/95 to-[#0b1329]/60" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_85%_50%,rgba(79,70,229,.22),transparent_50%)]" />
      </>}
      <div className={illustrated ? 'relative z-10 min-w-0 lg:max-w-[58%]' : ''}>
        {illustrated && <p className="mb-2 text-[10px] font-bold uppercase tracking-[.22em] text-cyan-200/90">CampusLuma · Student Success Intelligence</p>}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className={`mb-1.5 flex items-center gap-1.5 text-xs ${illustrated ? 'text-indigo-100/70' : 'text-slate-500'}`} aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                {crumb.to ? (
                  <Link to={crumb.to} className="hover:text-indigo-600 transition-colors">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={illustrated ? 'font-medium text-white' : 'font-medium text-slate-700'}>{crumb.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}
        <h1 className={illustrated ? 'text-2xl font-bold tracking-tight text-white sm:text-3xl' : 'text-2xl font-bold tracking-tight text-slate-900'}>{title}</h1>
        {subtitle && <p className={`mt-1 max-w-2xl text-xs leading-relaxed ${illustrated ? 'text-indigo-100/80 sm:text-sm' : 'text-slate-500'}`}>{subtitle}</p>}
      </div>

      <div className={`relative z-10 flex min-w-0 flex-wrap items-center gap-3 ${illustrated ? 'rounded-2xl border border-white/10 bg-[#0b1329]/75 p-2.5 backdrop-blur-sm sm:w-fit lg:max-w-[42%] lg:justify-end' : ''}`}>
        {actions}
        {(user || role) && (
          <div className={`flex min-w-0 max-w-full items-center gap-2 ${illustrated ? 'border-l border-white/20 pl-2' : 'border-l border-slate-200 pl-2'}`}>
            {user?.name && (
              <div className="flex min-w-0 max-w-40 flex-col text-left sm:max-w-52 lg:text-right">
                <span className={`truncate text-xs font-semibold leading-tight ${illustrated ? 'text-white' : 'text-slate-800'}`}>{user.name}</span>
                <span className={`truncate font-mono text-[10px] leading-tight ${illustrated ? 'text-indigo-100/75' : 'text-slate-400'}`}>{user.email}</span>
              </div>
            )}
            <span className="shrink-0">
              <Badge variant="indigo" size="md">
                <span className="capitalize font-semibold">{role}</span>
              </Badge>
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
