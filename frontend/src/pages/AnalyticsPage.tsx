import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { Header } from '../components/layout/Header';
import { ChartSkeleton, TableSkeleton } from '../components/ui/LoadingSkeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Award,
  BookOpen,
  Briefcase,
  Layers,
  GraduationCap,
  Eye,
} from 'lucide-react';
import { useAuth } from '../contexts/useAuth';

export function AnalyticsPage() {
  const { role } = useAuth();
  const canViewSegments = role === 'staff' || role === 'admin' || role === 'guest';
  const [activeTab, setActiveTab] = useState<'segments' | 'cohorts' | 'departments'>('segments');

  // Fetch Academic Strong / Placement Low segment
  const {
    data: segmentStudents,
    loading: segmentLoading,
    error: segmentError,
  } = useApi(
    () => (canViewSegments ? api.getAcademicStrongPlacementLow() : Promise.resolve([])),
    [canViewSegments]
  );

  // Fetch Cohorts
  const {
    data: cohorts,
    loading: cohortsLoading,
    error: cohortsError,
  } = useApi(() => api.getCohorts(), []);

  // Fetch Department Overview
  const {
    data: deptOverview,
    loading: deptLoading,
    error: deptError,
  } = useApi(() => api.getDepartmentOverview(), []);

  const {
    data: observationAnalytics,
    loading: observationsLoading,
    error: observationsError,
  } = useApi(() => api.getObservationAnalytics(), []);

  const cohortChartData = (cohorts || [])
    .filter((c) => c.average_success_score !== null)
    .slice(0, 15)
    .map((c) => ({
      name: `${c.department.slice(0, 8)} S${c.semester} (${c.cohort})`,
      score: c.average_success_score,
      students: c.students,
      scored: c.scored_students,
    }));

  return (
    <div className="space-y-6">
      <Header
        title="Academic & Placement Analytics"
        subtitle="Cross-indicator analytics, special student cohorts, and placement readiness segmentation"
      />

      <section className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs space-y-4" aria-label="Structured record analytics">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Imported academic and support measurements</h3>
          <p className="mt-1 text-xs text-slate-500">Subject, attendance, LMS, engagement, placement, skill, and feedback records grouped by actual stored date and measurement.</p>
        </div>
        {observationsLoading ? <p className="text-xs text-slate-500">Loading structured records…</p> : observationsError ?
          <Alert type="error" title="Could not load structured analytics">{observationsError}</Alert> : observationAnalytics?.total_records ? <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] uppercase text-slate-500">Stored records</p><p className="text-xl font-bold">{observationAnalytics.total_records}</p></div>
              {observationAnalytics.summaries.map((item) => <div key={`${item.category}-${item.metric}-${item.subject}-${item.term}`} className="rounded-lg bg-slate-50 p-3">
                <p className="text-[10px] uppercase text-slate-500">{item.category} · {item.metric}{item.subject ? ` · ${item.subject}` : ''}{item.term ? ` · ${item.term}` : ''}</p>
                <p className="text-lg font-bold">{item.average === null ? 'No numeric values' : item.average}</p>
                <p className="text-[10px] text-slate-500">{item.valued_records} measured · {item.students} students</p>
              </div>)}
            </div>
            {observationAnalytics.trends.length ? <div className="overflow-x-auto rounded-lg border border-slate-100">
              <table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-600"><tr>
                <th className="px-3 py-2">Date</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Subject / Course</th><th className="px-3 py-2">Term</th><th className="px-3 py-2">Measurement</th><th className="px-3 py-2">Average</th><th className="px-3 py-2">Records</th>
              </tr></thead><tbody className="divide-y divide-slate-100">{observationAnalytics.trends.map((item) => <tr key={`${item.category}-${item.metric}-${item.subject}-${item.term}-${item.date}`}>
                <td className="px-3 py-2">{item.date}</td><td className="px-3 py-2 capitalize">{item.category}</td><td className="px-3 py-2">{item.subject || '—'}</td><td className="px-3 py-2">{item.term || '—'}</td><td className="px-3 py-2">{item.metric}</td><td className="px-3 py-2">{item.average}</td><td className="px-3 py-2">{item.records}</td>
              </tr>)}</tbody></table>
            </div> : <p className="text-xs text-slate-500">Records exist, but none contain dates and numeric values needed for a time comparison.</p>}
            <p className="text-[11px] text-slate-500">{observationAnalytics.data_note}</p>
          </> : <EmptyState icon={BookOpen} title="No detailed records available" description="Import dated subject assessments, attendance sessions, LMS events, engagement activities, placement assessments, skill assessments, or feedback to enable these comparisons." />}
      </section>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('segments')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'segments'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>High Academic / Low Placement</span>
          {segmentStudents && segmentStudents.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-700 text-white">
              {segmentStudents.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('cohorts')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'cohorts'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <GraduationCap className="w-3.5 h-3.5" />
          <span>Cohort & Semester Comparison</span>
        </button>

        <button
          onClick={() => setActiveTab('departments')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'departments'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Department Performance</span>
        </button>
      </div>

      {/* Tab 1: Segments (High Academic / Low Placement) */}
      {activeTab === 'segments' && (
        <div className="space-y-4">
          <div className="min-w-0 overflow-hidden bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-indigo-600" />
                  High Academics (≥70%) · Low Placement Readiness (&lt;50%)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Students with sound foundational academic performance who require targeted aptitude, coding, or interview practice.
                </p>
              </div>
              <Badge variant="indigo">
                {segmentStudents?.length || 0} Identified Students
              </Badge>
            </div>

            {segmentLoading ? (
              <TableSkeleton rows={5} cols={5} />
            ) : segmentError ? (
              <Alert type="error" title="Failed to load segment">
                {segmentError}
              </Alert>
            ) : !segmentStudents || segmentStudents.length === 0 ? (
              <EmptyState
                icon={Award}
                title="No students match this segment"
                description="No stored students currently have academic score ≥ 70% and placement readiness < 50% with both indicators recorded."
              />
            ) : (
              <div className="overflow-x-auto border border-slate-100 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">Student ID</th>
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Academic Score</th>
                      <th className="py-3 px-4">Placement Readiness</th>
                      <th className="py-3 px-4">Suggested Support Action</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {segmentStudents.map((item) => (
                      <tr key={item.student_id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-slate-900">
                          {item.student_id}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800">
                          <Link to={`/students/${item.student_id}`} className="hover:text-indigo-600 transition-colors">
                            {item.name || item.student_id}
                          </Link>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                            {item.academic_score}%
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-100">
                            {item.placement_readiness}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-sm">
                          {item.suggestion}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link
                            to={`/students/${item.student_id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Profile</span>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Cohorts */}
      {activeTab === 'cohorts' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-slate-900">Cohort & Semester Performance Graph</h3>
              <p className="text-xs text-slate-500">Average student success scores across academic cohorts and semesters</p>
            </div>

            {cohortsLoading ? (
              <ChartSkeleton />
            ) : cohortsError ? (
              <Alert type="error" title="Could not load cohort comparisons">{cohortsError}</Alert>
            ) : cohortChartData.length > 0 ? (
              <div className="h-72 w-full min-w-0 max-w-full overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cohortChartData} margin={{ top: 10, right: 20, left: -10, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} angle={-30} textAnchor="end" />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} domain={[0, 100]} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                    <Bar dataKey="score" fill="#4f46e5" name="Average Success Score" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState title="No cohort data recorded" description="Import student records with department and semester information." />
            )}
          </div>

          {/* Cohort Table */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-slate-900">Aggregated Cohort Metrics</h3>
              <p className="text-xs text-slate-500">Enrolled count, scored count, and average success score by cohort</p>
            </div>

            {cohortsLoading ? (
              <TableSkeleton rows={4} cols={5} />
            ) : cohortsError ? (
              <Alert type="error" title="Could not load cohort metrics">{cohortsError}</Alert>
            ) : cohorts && cohorts.length > 0 ? (
              <div className="overflow-x-auto border border-slate-100 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">Department</th>
                      <th className="py-3 px-4">Semester</th>
                      <th className="py-3 px-4">Cohort</th>
                      <th className="py-3 px-4">Total Students</th>
                      <th className="py-3 px-4">Sufficiently Scored</th>
                      <th className="py-3 px-4">Average Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cohorts.map((c, i) => (
                      <tr key={i} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-medium text-slate-800">{c.department}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">Sem {c.semester}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{c.cohort}</td>
                        <td className="py-3 px-4 font-mono text-slate-700">{c.students}</td>
                        <td className="py-3 px-4 font-mono text-slate-700">{c.scored_students}</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-800">
                          {c.average_success_score !== null ? `${c.average_success_score}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState title="No cohort data recorded" description="Import records with cohort, department, and semester details to compare groups." />}
          </div>
        </div>
      )}

      {/* Tab 3: Department Performance */}
      {activeTab === 'departments' && (
        <div className="space-y-6">
          {deptLoading ? <TableSkeleton rows={4} cols={4} /> : deptError ? <Alert type="error" title="Could not load department analytics">{deptError}</Alert> : deptOverview && deptOverview.length > 0 ? <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {deptOverview?.map((d) => (
              <div key={d.department} className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h4 className="text-sm font-bold text-slate-900 truncate">{d.department}</h4>
                  <Badge variant="indigo">{d.student_count} Students</Badge>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Mean Success Score</span>
                    <span className="font-mono font-bold text-slate-800">{d.avg_success_score !== null ? `${d.avg_success_score}%` : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Mean Attendance</span>
                    <span className="font-mono font-bold text-slate-800">{d.avg_attendance !== null ? `${d.avg_attendance}%` : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Placement Readiness</span>
                    <span className="font-mono font-bold text-slate-800">{d.avg_placement_readiness !== null ? `${d.avg_placement_readiness}%` : '—'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div> : <EmptyState title="No department data available" description="Department comparisons appear when student records include department information." />}
        </div>
      )}
    </div>
  );
}

