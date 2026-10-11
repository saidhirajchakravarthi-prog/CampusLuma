import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { Header } from '../components/layout/Header';
import { KpiCard } from '../components/ui/KpiCard';
import { SyntheticDataBanner } from '../components/ui/SyntheticDataBanner';
import { CardSkeleton, ChartSkeleton } from '../components/ui/LoadingSkeleton';
import { Alert } from '../components/ui/Alert';
import { RiskBadge, Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import {
  Users,
  Target,
  Clock,
  Briefcase,
  AlertTriangle,
  Layers,
  ArrowRight,
  TrendingDown,
  Info,
  ExternalLink,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';

const RISK_COLORS: Record<string, string> = {
  'High Risk': '#f43f5e',
  'Medium Risk': '#f59e0b',
  'Low Risk': '#10b981',
};

export function OverviewPage() {
  const { role } = useAuth();
  const canManage = role === 'staff' || role === 'admin';
  const canViewRisk = canManage || role === 'guest';

  const {
    data: overview,
    loading: overviewLoading,
    error: overviewError,
  } = useApi(() => api.getOverview(), []);

  const {
    data: deptOverview,
    loading: deptLoading,
    error: deptError,
  } = useApi(() => api.getDepartmentOverview(), []);

  const {
    data: atRiskStudents,
    loading: atRiskLoading,
  } = useApi(
    () => (canViewRisk ? api.getAtRisk() : Promise.resolve([])),
    [canViewRisk]
  );

  if (overviewError) {
    return (
      <div>
        <Header title="CampusLuma Overview" subtitle="AI-Powered Student Success Intelligence · KPMG India Smart Campus Analytics Challenge" />
        <Alert type="error" title="Failed to load campus overview data">
          {overviewError}
        </Alert>
      </div>
    );
  }

  // Risk Distribution Data for Recharts Pie
  const riskPieData = overview?.risk_distribution
    ? Object.entries(overview.risk_distribution).map(([name, value]) => ({
        name,
        value,
      }))
    : [];

  // Score Distribution Data for Recharts Bar
  const scoreDistData = overview?.success_score_distribution
    ? Object.entries(overview.success_score_distribution)
        .map(([range, count]) => ({
          range,
          count,
        }))
        .sort((a, b) => parseInt(a.range) - parseInt(b.range))
    : [];

  // High risk count
  const highRiskCount = overview?.risk_distribution?.['High Risk'] ?? 0;
  const mediumRiskCount = overview?.risk_distribution?.['Medium Risk'] ?? 0;

  return (
    <div className="space-y-6">
      <Header
        title="Campus Overview"
        subtitle={role === 'guest' ? 'Synthetic demo metrics, success scoring, and early warning signals' : 'Campus performance insights, success scoring, and early warning signals'}
        actions={
          canManage && (
            <div className="flex items-center gap-2">
              <Link
                to="/students"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <span>View Directory</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </Link>
              <Link
                to="/imports"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-2xs"
              >
                <span>Import Data</span>
              </Link>
            </div>
          )
        }
      />

      <SyntheticDataBanner guest={role === 'guest'} />
      {deptError && <Alert type="error" title="Department comparison unavailable">{deptError}</Alert>}

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {overviewLoading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            <KpiCard
              title={role === 'guest' ? 'Demo Student Profiles' : 'Student Records'}
              value={overview?.student_count ?? 0}
              subtitle={role === 'guest' ? 'Synthetic demo records' : 'Records available in this workspace'}
              icon={Users}
              iconColor="text-indigo-600"
            />
            <KpiCard
              title="Mean Success Score"
              value={overview?.average_success_score !== null && overview?.average_success_score !== undefined ? `${overview.average_success_score}%` : null}
              subtitle={`${overview?.scored_students ?? 0} students sufficiently covered`}
              icon={Target}
              iconColor="text-teal-600"
              unavailable={overview?.average_success_score === null}
            />
            <KpiCard
              title="Average Attendance"
              value={overview?.average_attendance !== null && overview?.average_attendance !== undefined ? `${overview.average_attendance}%` : null}
              subtitle="Across lecture & subject metrics"
              icon={Clock}
              iconColor="text-sky-600"
              unavailable={overview?.average_attendance === null}
            />
            <KpiCard
              title="Placement Readiness"
              value={overview?.average_placement_readiness !== null && overview?.average_placement_readiness !== undefined ? `${overview.average_placement_readiness}%` : null}
              subtitle="Aptitude, coding & interview mean"
              icon={Briefcase}
              iconColor="text-purple-600"
              unavailable={overview?.average_placement_readiness === null}
            />
          </>
        )}
      </div>

      {/* Secondary KPI Bar (Coverage & Attention Metrics) */}
      {!overviewLoading && overview && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="min-w-0 bg-white rounded-xl border border-slate-200/80 p-4 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="shrink-0 p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
                <Target className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs leading-snug text-slate-500 font-medium">Reliable Score Coverage</p>
                <p className="text-lg font-bold tabular-nums text-slate-800 break-words">
                  {overview.scored_students} <span className="text-xs font-normal text-slate-500">/ {overview.student_count}</span>
                </p>
              </div>
            </div>
            <Badge variant="success">
              {overview.student_count > 0 ? `${Math.round((overview.scored_students / overview.student_count) * 100)}%` : '0%'}
            </Badge>
          </div>

          <div className="min-w-0 bg-white rounded-xl border border-slate-200/80 p-4 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="shrink-0 p-2 rounded-lg bg-amber-50 text-amber-600 border border-amber-100">
                <Layers className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs leading-snug text-slate-500 font-medium">Needs More Data</p>
                <p className="text-lg font-bold tabular-nums text-slate-800 break-words">{overview.insufficient_data}</p>
              </div>
            </div>
            <span className="max-w-32 shrink-0 text-right text-[11px] leading-snug text-slate-400">Under 50% category weight</span>
          </div>

          <div className="min-w-0 bg-white rounded-xl border border-slate-200/80 p-4 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="shrink-0 p-2 rounded-lg bg-rose-50 text-rose-600 border border-rose-100">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs leading-snug text-slate-500 font-medium">{role === 'guest' ? 'Demo Risk Signals' : 'Flagged For Support'}</p>
                <p className="text-lg font-bold tabular-nums text-slate-800 break-words">{highRiskCount + mediumRiskCount}</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-rose-600">{highRiskCount} High · {mediumRiskCount} Med</span>
          </div>
        </div>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Distribution Chart */}
        <div className="min-w-0 overflow-hidden bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Student Risk Tier Distribution</h3>
              <p className="text-xs text-slate-500">Based on sufficiently scored records (score &lt; 40 High, &lt; 65 Med)</p>
            </div>
            {canManage && (
              <Link to="/at-risk" className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                Details <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>

          <div className="flex-1 min-h-[260px] flex w-full min-w-0 max-w-full items-center justify-center overflow-hidden">
            {overviewLoading ? (
              <ChartSkeleton />
            ) : riskPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={riskPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
                  >
                    {riskPieData.map((entry) => (
                      <Cell key={entry.name} fill={RISK_COLORS[entry.name] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                    formatter={(val) => [`${val} students`, 'Count']}
                  />
                  <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No risk data available" description="Import student records with academic and attendance data to generate risk tiers." />
            )}
          </div>
        </div>

        {/* Score Distribution Chart */}
        <div className="min-w-0 overflow-hidden bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Success Score Distribution</h3>
              <p className="text-xs text-slate-500">Grouped into 20-point brackets (0-100 scale)</p>
            </div>
          </div>

          <div className="flex-1 min-h-[260px] flex w-full min-w-0 max-w-full items-center justify-center overflow-hidden">
            {overviewLoading ? (
              <ChartSkeleton />
            ) : scoreDistData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={scoreDistData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="range" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                    formatter={(val) => [`${val} students`, 'Frequency']}
                  />
                  <Bar dataKey="count" fill="#4f46e5" radius={[6, 6, 0, 0]} name="Students" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No score distribution data" description="Students must have sufficient category data to compute normalized scores." />
            )}
          </div>
        </div>
      </div>

      {/* Department Comparison Chart */}
      {deptLoading && <ChartSkeleton />}
      {deptOverview && deptOverview.length > 0 && (
        <div className="min-w-0 overflow-hidden bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Department Performance Breakdown</h3>
            <p className="text-xs text-slate-500">Average success score, attendance, and placement readiness across departments</p>
          </div>
          <div className="h-72 w-full min-w-0 max-w-full overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={deptOverview}
                margin={{ top: 10, right: 20, left: -10, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="department" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                <Bar dataKey="avg_success_score" fill="#4f46e5" name="Avg Success Score" radius={[4, 4, 0, 0]} />
                <Bar dataKey="avg_attendance" fill="#0d9488" name="Avg Attendance %" radius={[4, 4, 0, 0]} />
                <Bar dataKey="avg_placement_readiness" fill="#8b5cf6" name="Avg Placement Readiness" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Priority Insights Section */}
      {canManage && (
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
                <TrendingDown className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Priority Insights & Early Warnings</h3>
                <p className="text-xs text-slate-500">Immediate support candidates identified by multi-indicator risk analysis</p>
              </div>
            </div>
            <Link
              to="/at-risk"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
            >
              Full risk directory <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {atRiskLoading ? (
            <div className="space-y-3">
              <div className="h-12 bg-slate-100 rounded-lg animate-pulse" />
              <div className="h-12 bg-slate-100 rounded-lg animate-pulse" />
              <div className="h-12 bg-slate-100 rounded-lg animate-pulse" />
            </div>
          ) : atRiskStudents && atRiskStudents.length > 0 ? (
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
              {atRiskStudents.slice(0, 5).map((student) => (
                <div key={student.student_id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0 font-mono">
                      {student.student_id.slice(-4)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/students/${student.student_id}`}
                          className="text-xs font-semibold text-slate-900 hover:text-indigo-600 transition-colors"
                        >
                          {student.name || student.student_id}
                        </Link>
                        <span className="text-[11px] font-mono text-slate-400">({student.student_id})</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-slate-500">
                          {student.department || 'General'} · Sem {student.semester || '—'}
                        </span>
                        <span className="text-[11px] text-slate-400">·</span>
                        <span className="text-[11px] text-slate-500">
                          Coverage: {student.data_coverage ?? '—'}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:justify-end">
                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-800">{student.score}%</div>
                      <div className="text-[10px] text-slate-400">Success Score</div>
                    </div>
                    <RiskBadge level={student.risk_level} />
                    <Link
                      to={`/students/${student.student_id}`}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 transition-colors"
                    >
                      Profile
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No high or medium risk students"
              description="No students currently meet the at-risk criteria with sufficient category coverage."
            />
          )}

          {overview?.score_method && (
            <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-2 text-[11px] text-slate-500">
              <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span>{overview.score_method}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
