import { useState } from 'react';
import { api } from '../api/client';
import { Header } from '../components/layout/Header';
import { SyntheticDataBanner } from '../components/ui/SyntheticDataBanner';
import { Alert } from '../components/ui/Alert';
import { downloadBlob } from '../downloads';
import { useAuth } from '../contexts/useAuth';
import {
  FileSpreadsheet,
  FileText,
  Download,
  CheckCircle2,
  FileCode,
  Info,
} from 'lucide-react';

interface ReportCardProps {
  title: string;
  format: 'xlsx' | 'csv' | 'pdf' | 'observations-csv';
  extension: string;
  description: string;
  contents: string[];
  icon: typeof FileSpreadsheet;
  iconBg: string;
  iconColor: string;
}

export function ReportsPage() {
  const { role } = useAuth();
  const isGuest = role === 'guest';
  const [downloading, setDownloading] = useState<string | null>(null);
  const [lastDownloaded, setLastDownloaded] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDownload = async (format: 'xlsx' | 'csv' | 'pdf' | 'observations-csv', filename: string) => {
    setDownloading(format);
    setErrorMsg(null);
    try {
      const blob = await api.downloadReport(format);
      downloadBlob(blob, filename);
      setLastDownloaded(filename);
    } catch (err: any) {
      setErrorMsg(err.message || `Failed to generate or download ${filename}.`);
    } finally {
      setDownloading(null);
    }
  };

  const reports: ReportCardProps[] = [
    {
      title: isGuest ? 'Synthetic Demo Student Dataset' : 'Institutional Student Master Dataset',
      format: 'xlsx',
      extension: '.xlsx',
      description: isGuest ? 'Workbook of explicitly synthetic demo profiles, calculated scores, and data coverage indicators.' : 'Comprehensive workbook with available student indicator records, calculated scores, and data coverage indicators.',
      contents: [
        'Complete academic, attendance, and LMS metrics',
        'Normalized category weights and scores',
        'Data reliability and coverage flags',
        isGuest ? 'Structured spreadsheet for demo evaluation' : 'Structured spreadsheet for authorized reporting',
      ],
      icon: FileSpreadsheet,
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-700',
    },
    {
      title: isGuest ? 'Demo Student Analytics Export (CSV)' : 'Student Analytics Master Export (CSV)',
      format: 'csv',
      extension: '.csv',
      description: isGuest ? 'Tabular export of synthetic demo records for technical evaluation and analytics.' : 'Tabular export of available records for authorized analytics workflows.',
      contents: [
        'Flattened canonical data columns',
        'Success score values and reliability status',
        'Department, semester, and cohort identifiers',
        'Immediate compatibility with BI tools, pandas, and R',
      ],
      icon: FileCode,
      iconBg: 'bg-indigo-50',
      iconColor: 'text-indigo-700',
    },
    {
      title: isGuest ? 'Demo Summary & Early Warning Report' : 'Executive Campus Summary & Early Warning Audit',
      format: 'pdf',
      extension: '.pdf',
      description: 'Formatted executive briefing document featuring high-level campus KPIs and detailed at-risk student records.',
      contents: [
        isGuest ? 'Synthetic demo record count, mean score, and attendance metrics' : 'Authorized student count, mean score, and attendance metrics',
        'Tabulated high-risk and medium-risk student listings',
        'Observed contributing factor breakdown per student',
        'Audit watermark and development policy disclaimer',
      ],
      icon: FileText,
      iconBg: 'bg-rose-50',
      iconColor: 'text-rose-700',
    },
    {
      title: 'Dated Student Observations',
      format: 'observations-csv',
      extension: '.csv',
      description: 'Structured record export with event dates, measures, source filenames, import IDs and synthetic-data labels.',
      contents: ['Subject marks and backlogs', 'Attendance sessions and LMS events', 'Engagement, placement, skills and feedback', 'Record provenance and data-origin flags'],
      icon: FileCode,
      iconBg: 'bg-sky-50',
      iconColor: 'text-sky-700',
    },
  ];

  return (
    <div className="space-y-6">
      <Header
        title={isGuest ? 'Demo Reports & Exports' : 'Institutional Reports & Exports'}
        subtitle={isGuest ? 'Generate CSV, Excel, and PDF files from the isolated synthetic demo workspace' : 'Generate and download Excel, CSV, and PDF summaries from records available to your role'}
      />

      <SyntheticDataBanner guest={isGuest} />

      {errorMsg && (
        <Alert type="error" title="Report Generation Error">
          {errorMsg}
        </Alert>
      )}

      {lastDownloaded && (
        <Alert type="success" title="Download started">
          The browser was asked to save <strong>{lastDownloaded}</strong>. Check your downloads list if it does not appear.
        </Alert>
      )}

      {/* Reports Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {reports.map((report) => {
          const Icon = report.icon;
          const isCurrentLoading = downloading === report.format;

          return (
            <div
              key={report.format}
              className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between space-y-5 hover:shadow-sm transition-shadow"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className={`p-3 rounded-xl ${report.iconBg} ${report.iconColor} border border-slate-100`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                    {report.extension}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-900">{report.title}</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{report.description}</p>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Included Information
                  </span>
                  <ul className="space-y-1 text-xs text-slate-600">
                    {report.contents.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <button
                  onClick={() => handleDownload(report.format, report.format === 'observations-csv' ? 'campusluma_observations.csv' : `campusluma_report${report.extension}`)}
                  disabled={isCurrentLoading}
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white font-semibold text-xs shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isCurrentLoading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Generating Report Stream...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Download {report.extension.toUpperCase()} Report</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Audit & provenance notice */}
      <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600 flex items-start gap-3 shadow-2xs">
        <Info className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
        <div className="space-y-1 leading-relaxed">
          <p className="font-bold text-slate-800">Report Provenance & Regulatory Notice</p>
          <p className="text-[11px] text-slate-500">
            {isGuest ? 'Guest exports are built from the separately stored synthetic demo workspace and exclude operational records.' : 'Reports are generated from records available to your application role in the configured database.'}
            {' '}Exported documents identify prototype scoring and data provenance limits.
            Verify underlying student consent and institutional FERPA/GDPR compliance prior to transmitting student datasets outside secure institutional boundaries.
          </p>
        </div>
      </div>
    </div>
  );
}

