import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { Header } from '../components/layout/Header';
import { TableSkeleton } from '../components/ui/LoadingSkeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { Alert } from '../components/ui/Alert';
import { downloadBlob, rowsToCsv } from '../downloads';
import { RiskBadge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import {
  AlertTriangle,
  Download,
  Filter,
  Eye,
  PlusCircle,
  Info,
  ShieldAlert,
} from 'lucide-react';
import { AtRiskStudent } from '../api/types';
import { useAuth } from '../contexts/useAuth';

const FACTOR_TRANSLATIONS: Record<string, { label: string; suggestion: string }> = {
  academic: {
    label: 'Academic Performance Deficit',
    suggestion: 'Recommend remedial subject tutoring and backlog clearance sessions.',
  },
  attendance: {
    label: 'Low Lecture Attendance',
    suggestion: 'Initiate attendance barrier review; notify student counselor for wellness check.',
  },
  lms: {
    label: 'Low LMS & Assignment Engagement',
    suggestion: 'Monitor digital portal activity and schedule assignment deadline check-ins.',
  },
  engagement: {
    label: 'Minimal Extracurricular Engagement',
    suggestion: 'Encourage participation in departmental clubs, tech hackathons, or workshops.',
  },
  placement: {
    label: 'Placement Readiness Gap',
    suggestion: 'Enroll in coding practice marathons and mock interview coaching.',
  },
  skills: {
    label: 'Technical / Soft Skill Deficiency',
    suggestion: 'Provide access to certification vouchers and communication training modules.',
  },
  feedback: {
    label: 'Sub-optimal Satisfaction / Faculty Feedback',
    suggestion: 'Arrange 1-on-1 advisor mentoring to address academic barriers.',
  },
};
const EMPTY_RISK_STUDENTS: AtRiskStudent[] = [];

export function AtRiskPage() {
  const { role } = useAuth();
  const isGuest = role === 'guest';
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [selectedSem, setSelectedSem] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortDescending, setSortDescending] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Intervention modal state
  const [activeStudentForIntervention, setActiveStudentForIntervention] = useState<AtRiskStudent | null>(null);
  const [actionDesc, setActionDesc] = useState('');
  const [assignedOwner, setAssignedOwner] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [submittingIntervention, setSubmittingIntervention] = useState(false);
  const [interventionSuccessMsg, setInterventionSuccessMsg] = useState<string | null>(null);
  const [interventionErrorMsg, setInterventionErrorMsg] = useState<string | null>(null);

  // Departments for dropdown
  const { data: departments } = useApi(() => api.getDepartments(), []);

  // Fetch at-risk records
  const {
    data: atRiskStudents,
    loading,
    error,
    refetch,
  } = useApi(
    () =>
      api.getAtRisk({
        risk_level: selectedRiskLevel || undefined,
        department: selectedDept || undefined,
        semester: selectedSem || undefined,
      }),
    [selectedRiskLevel, selectedDept, selectedSem]
  );

  const studentsList = atRiskStudents ?? EMPTY_RISK_STUDENTS;
  const filteredStudents = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase();
    return studentsList
      .filter((student) => !query || [student.student_id, student.name, student.department].some((value) => value?.toLocaleLowerCase().includes(query)))
      .sort((left, right) => sortDescending ? right.score - left.score : left.score - right.score);
  }, [studentsList, searchTerm, sortDescending]);
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const visibleStudents = filteredStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleExportCSV = () => {
    if (filteredStudents.length === 0) return;
    const rows = filteredStudents.map((s) => ({
      student_id: s.student_id,
      name: s.name || '',
      department: s.department || '',
      semester: s.semester || '',
      risk_level: s.risk_level,
      score: s.score,
      coverage_percent: s.data_coverage || '',
      contributing_factors: s.contributing_factors
        .map(([name, score]) => `${name} (${score}%)`)
        .join('; '),
    }));

    downloadBlob(new Blob([`\uFEFF${rowsToCsv(rows)}`], { type: 'text/csv;charset=utf-8' }), 'campusluma_at_risk_students.csv');
  };

  const handleCreateIntervention = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStudentForIntervention || !actionDesc.trim()) return;
    setSubmittingIntervention(true);
    setInterventionErrorMsg(null);
    try {
      await api.createIntervention({
        student_id: activeStudentForIntervention.student_id,
        description: actionDesc.trim(),
        owner: assignedOwner.trim() || null,
        follow_up_date: followUpDate || null,
      });
      setActionDesc('');
      setAssignedOwner('');
      setFollowUpDate('');
      setActiveStudentForIntervention(null);
      setInterventionSuccessMsg(
        `Support action recorded for ${activeStudentForIntervention.student_id}.`
      );
      refetch();
    } catch (err: any) {
      setInterventionErrorMsg(err instanceof Error ? err.message : 'Failed to create the intervention.');
    } finally {
      setSubmittingIntervention(false);
    }
  };

  const highRiskCount = useMemo(
    () => studentsList.filter((s) => s.risk_level === 'High Risk').length,
    [studentsList]
  );
  const mediumRiskCount = useMemo(
    () => studentsList.filter((s) => s.risk_level === 'Medium Risk').length,
    [studentsList]
  );

  return (
    <div className="space-y-6">
      <Header
        title="Early Warning & Risk Analytics"
        subtitle={isGuest
          ? 'Review synthetic demo risk signals and record support actions within the isolated demo workspace.'
          : 'Proactively identify vulnerable students and configure early academic interventions'}
        actions={
          <>
          <button
            onClick={handleExportCSV}
            disabled={filteredStudents.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Download At-Risk CSV</span>
          </button>
          {isGuest && <span className="text-[11px] text-slate-500">Support actions are saved to the demo workspace.</span>}
          </>
        }
      />

      {interventionSuccessMsg && (
        <Alert type="success" title="Intervention Logged">
          {interventionSuccessMsg}
        </Alert>
      )}

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Total Flagged</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{studentsList.length}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 p-4 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-xs text-rose-600 font-semibold uppercase tracking-wider">High Risk (&lt;40% Score)</p>
            <p className="text-2xl font-bold text-rose-600 mt-1">{highRiskCount}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 p-4 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-xs text-amber-600 font-semibold uppercase tracking-wider">Medium Risk (&lt;65% Score)</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{mediumRiskCount}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex flex-wrap items-center gap-3">
        <input aria-label="Search at-risk students by ID, name, or department" value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setCurrentPage(1); }} placeholder="Search student or department" className="w-full sm:w-64 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs" />
        <button type="button" onClick={() => { setSortDescending(!sortDescending); setCurrentPage(1); }} aria-label={`Sort by score ${sortDescending ? 'ascending' : 'descending'}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
          Sort score: {sortDescending ? 'high to low' : 'low to high'}
        </button>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold">
          <Filter className="w-4 h-4 text-slate-400" />
          <span>Filters:</span>
        </div>

        {/* Risk Level Filter */}
        <select
          value={selectedRiskLevel}
          aria-label="Filter at-risk students by risk tier"
          onChange={(e) => { setSelectedRiskLevel(e.target.value); setCurrentPage(1); }}
          className="py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <option value="">All Risk Tiers</option>
          <option value="High Risk">High Risk Only</option>
          <option value="Medium Risk">Medium Risk Only</option>
        </select>

        {/* Department Filter */}
        <select
          value={selectedDept}
          aria-label="Filter at-risk students by department"
          onChange={(e) => { setSelectedDept(e.target.value); setCurrentPage(1); }}
          className="py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <option value="">All Departments</option>
          {departments?.map((dept) => (
            <option key={dept} value={dept}>
              {dept}
            </option>
          ))}
        </select>

        {/* Semester Filter */}
        <select
          value={selectedSem}
          aria-label="Filter at-risk students by semester"
          onChange={(e) => { setSelectedSem(e.target.value); setCurrentPage(1); }}
          className="py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <option value="">All Semesters</option>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
            <option key={s} value={String(s)}>
              Sem {s}
            </option>
          ))}
        </select>

        {(searchTerm || selectedRiskLevel || selectedDept || selectedSem) && (
          <button
            onClick={() => {
              setSearchTerm('');
              setSelectedRiskLevel('');
              setSelectedDept('');
              setSelectedSem('');
              setCurrentPage(1);
            }}
            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium ml-auto"
          >
            Clear Filters
          </button>
        )}
      </div>

      {error && (
        <Alert type="error" title="Failed to load early warning data">
          {error}
        </Alert>
      )}

      {/* Main At-Risk Cards / List */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : filteredStudents.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title={studentsList.length > 0 ? 'No students match this search' : 'No students match the selected risk criteria'}
            description={studentsList.length > 0 ? 'Try another student ID, name, or department.' : 'No students with a reliable score below 65% match these filters. Records without enough evidence to calculate a reliable score are excluded from risk tiers.'}
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleStudents.map((student) => (
              <div
                key={student.student_id}
                className="p-5 hover:bg-slate-50/60 transition-colors flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
              >
                {/* Left: Student Identity */}
                <div className="space-y-1.5 min-w-[240px]">
                  <div className="flex items-center gap-2.5">
                    <Link
                      to={`/students/${student.student_id}`}
                      className="text-sm font-bold text-slate-900 hover:text-indigo-600 transition-colors"
                    >
                      {student.name || student.student_id}
                    </Link>
                    <RiskBadge level={student.risk_level} />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono text-slate-700">{student.student_id}</span>
                    <span>·</span>
                    <span>{student.department || 'General'}</span>
                    <span>·</span>
                    <span>Sem {student.semester || '—'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs pt-1">
                    <div className="flex items-center gap-1 text-slate-600">
                      <span className="text-[11px] text-slate-400">Score:</span>
                      <strong className="font-mono text-slate-800">{student.score}%</strong>
                    </div>
                    <span className="text-slate-300">|</span>
                    <div className="flex items-center gap-1 text-slate-600">
                      <span className="text-[11px] text-slate-400">Data Coverage:</span>
                      <strong className="font-mono text-slate-800">{student.data_coverage ?? '—'}%</strong>
                    </div>
                  </div>
                </div>

                {/* Center: Contributing Weak Factors */}
                <div className="flex-1 max-w-xl space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <span>Contributing Risk Factors & Support Recommendations</span>
                  </p>
                  <div className="space-y-1.5">
                    {student.contributing_factors.map(([category, value]) => {
                      const meta = FACTOR_TRANSLATIONS[category] || {
                        label: `${category} Performance`,
                        suggestion: 'Review relevant indicator records.',
                      };
                      return (
                        <div
                          key={category}
                          className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                        >
                          <div>
                            <span className="font-semibold text-slate-800 capitalize">
                              {meta.label}
                            </span>
                            <span className="text-[11px] text-slate-500 block">
                              {meta.suggestion}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded text-[11px] shrink-0 border border-rose-100">
                            {value}% category score
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0 w-full sm:w-auto justify-end pt-2 sm:pt-0">
                  <Link
                    to={`/students/${student.student_id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Profile</span>
                  </Link>

                  <button
                    onClick={() => setActiveStudentForIntervention(student)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-2xs cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Start Intervention</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && filteredStudents.length > 0 && <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
          <span>Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredStudents.length)} of {filteredStudents.length}</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage <= 1} aria-label="Previous at-risk results page" className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40">Previous</button>
            <span>Page {currentPage} of {totalPages}</span>
            <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage >= totalPages} aria-label="Next at-risk results page" className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40">Next</button>
          </div>
        </div>}
      </div>

      {/* Model & Policy Disclaimer */}
      <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/80 text-xs text-slate-600 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-slate-800">Responsible Analytics & Policy Guidance</p>
          <p className="text-[11px] leading-relaxed text-slate-500">
            Risk tiers are derived by evaluating available category scores against heuristic policy thresholds (High: &lt;40%, Medium: &lt;65%).
            {isGuest ? 'These synthetic-data signals demonstrate the prototype workflow only and are not validated student outcome judgements.' : 'These scores serve as institutional alerts for advisors and counselors, not automated academic judgements. All consequential interventions require human review and contextual evaluation.'}
          </p>
        </div>
      </div>

      {/* Intervention Modal */}
      <Dialog
        open={!!activeStudentForIntervention}
        onClose={() => setActiveStudentForIntervention(null)}
        title={`Initiate Support Intervention for ${activeStudentForIntervention?.name || activeStudentForIntervention?.student_id}`}
      >
        <form onSubmit={handleCreateIntervention} className="space-y-4">
          {interventionErrorMsg && <Alert type="error" title="Intervention could not be saved">{interventionErrorMsg}</Alert>}
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200/80 text-xs text-amber-900">
            <strong>Target student:</strong> {activeStudentForIntervention?.student_id} (
            {activeStudentForIntervention?.risk_level} · Score: {activeStudentForIntervention?.score}%)
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Planned Support Action <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              placeholder="e.g., Scheduled remedial sessions and barrier consultation with advisor..."
              value={actionDesc}
              onChange={(e) => setActionDesc(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Assigned Owner / Mentor
              </label>
              <input
                type="text"
                placeholder="e.g., Prof. Rao"
                value={assignedOwner}
                onChange={(e) => setAssignedOwner(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Target Follow-Up Date
              </label>
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setActiveStudentForIntervention(null)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingIntervention || !actionDesc.trim()}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {submittingIntervention ? 'Saving...' : 'Confirm Intervention'}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

