import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { Header } from '../components/layout/Header';
import { CardSkeleton } from '../components/ui/LoadingSkeleton';
import { Alert } from '../components/ui/Alert';
import { RiskBadge, Badge, StatusBadge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import {
  BookOpen,
  Award,
  Layers,
  Laptop,
  MessageSquare,
  Sparkles,
  ClipboardList,
  PlusCircle,
  Clock,
  Info,
} from 'lucide-react';

function formatVal(val: any, suffix = '') {
  if (val === null || val === undefined || val === '') {
    return <span className="text-slate-400 font-normal italic">Not recorded</span>;
  }
  return <span className="font-semibold text-slate-800">{val}{suffix}</span>;
}

export function StudentProfilePage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [isInterventionModalOpen, setIsInterventionModalOpen] = useState(false);
  const [actionDesc, setActionDesc] = useState('');
  const [assignedOwner, setAssignedOwner] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [submittingIntervention, setSubmittingIntervention] = useState(false);
  const [interventionSuccessMsg, setInterventionSuccessMsg] = useState<string | null>(null);
  const [interventionErrorMsg, setInterventionErrorMsg] = useState<string | null>(null);

  const {
    data: student,
    loading,
    error,
    refetch,
  } = useApi(() => api.getStudent(studentId || ''), [studentId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Header
          title="Student Profile"
          subtitle="Loading comprehensive student analytics record..."
          breadcrumbs={[{ label: 'Directory', to: '/students' }, { label: studentId || 'Profile' }]}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="space-y-6">
        <Header
          title="Student Profile"
          subtitle="Record not found or unavailable"
          breadcrumbs={[{ label: 'Directory', to: '/students' }, { label: studentId || 'Error' }]}
        />
        <Alert type="error" title="Student Profile Unavailable">
          {error || 'Unable to retrieve record for this student identifier.'}
        </Alert>
        <Link
          to="/students"
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors"
        >
          Return to Student Directory
        </Link>
      </div>
    );
  }

  const raw = student.data || {};
  const score = student.success_score;
  const isReliable = score?.reliable && score.score !== null;
  const scoreVal = score?.score;
  const riskTier =
    !isReliable
      ? 'Unknown'
      : (scoreVal ?? 100) < 40
      ? 'High Risk'
      : (scoreVal ?? 100) < 65
      ? 'Medium Risk'
      : 'Low Risk';

  const handleCreateIntervention = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionDesc.trim()) return;
    setSubmittingIntervention(true);
    setInterventionErrorMsg(null);
    try {
      await api.createIntervention({
        student_id: student.student_id,
        description: actionDesc.trim(),
        owner: assignedOwner.trim() || null,
        follow_up_date: followUpDate || null,
      });
      setActionDesc('');
      setAssignedOwner('');
      setFollowUpDate('');
      setIsInterventionModalOpen(false);
      setInterventionSuccessMsg('Intervention logged successfully.');
      refetch();
    } catch (err: any) {
      setInterventionErrorMsg(err instanceof Error ? err.message : 'Failed to create the intervention.');
    } finally {
      setSubmittingIntervention(false);
    }
  };

  return (
    <div className="space-y-6">
      <Header
        title={raw.name || student.student_id}
        subtitle={`Student Profile: ${student.student_id} · ${student.department || 'General'} · Semester ${student.semester || '—'}`}
        breadcrumbs={[
          { label: 'Directory', to: '/students' },
          { label: student.student_id },
        ]}
        actions={(
          <button
            onClick={() => setIsInterventionModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-2xs cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Create Intervention</span>
          </button>
        )}
      />

      {interventionSuccessMsg && (
        <Alert type="success" title="Success">
          {interventionSuccessMsg}
        </Alert>
      )}

      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
        <span className="font-semibold text-slate-800">Record provenance:</span>{' '}
        {raw.data_origin || 'Origin not supplied'} · source file {student.source || 'unknown'} · last updated {student.updated_at}
      </div>

      {/* Top Profile Summary Strip */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#0b1329] to-[#1b284f] text-white flex items-center justify-center font-bold text-lg font-mono shadow-sm">
            {student.student_id.slice(-4)}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold text-slate-900">{raw.name || 'Unnamed Student'}</h2>
              {isReliable ? <RiskBadge level={riskTier} /> : <Badge variant="neutral">Provisional Data</Badge>}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
              <span>ID: <strong className="font-mono text-slate-700">{student.student_id}</strong></span>
              <span>·</span>
              <span>Dept: <strong className="text-slate-700">{student.department || 'Unassigned'}</strong></span>
              <span>·</span>
              <span>Semester: <strong className="text-slate-700">{student.semester || '—'}</strong></span>
              <span>·</span>
              <span>Cohort: <strong className="text-slate-700">{student.cohort || '—'}</strong></span>
            </div>
          </div>
        </div>

        {/* Success Score Badge Box */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex items-center gap-5 w-full md:w-auto justify-between md:justify-start">
          <div className="text-left">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">Overall Success Score</span>
            <div className="text-2xl font-black text-slate-900 font-mono mt-0.5">
              {isReliable ? `${scoreVal}%` : 'Insufficient Data'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {score?.coverage_percent}% Category Coverage
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Grid of Modular Profile Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* 1. Academic Performance */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
            <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
              <BookOpen className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Academic Performance</h3>
          </div>
          <dl className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Cumulative GPA (CGPA)</dt>
              <dd className="font-mono">{formatVal(raw.cgpa, ' / 10')}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Aggregate Marks</dt>
              <dd className="font-mono">{formatVal(raw.marks, '%')}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Active Backlogs</dt>
              <dd className="font-mono">{formatVal(raw.backlogs)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Subject Performance Score</dt>
              <dd className="font-mono">{formatVal(raw.subject_performance, '%')}</dd>
            </div>
          </dl>
        </div>

        {/* 2. Attendance Metrics */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
            <div className="p-1.5 rounded-lg bg-teal-50 text-teal-600">
              <Clock className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Attendance Monitoring</h3>
          </div>
          <dl className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Overall Attendance</dt>
              <dd className="font-mono">{formatVal(raw.attendance, '%')}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Subject-Specific Attendance</dt>
              <dd className="font-mono">{formatVal(raw.subject_attendance, '%')}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Daily Study Hours</dt>
              <dd className="font-mono">{formatVal(raw.study_hours, ' hrs/day')}</dd>
            </div>
          </dl>
        </div>

        {/* 3. LMS & Digital Learning */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
            <div className="p-1.5 rounded-lg bg-sky-50 text-sky-600">
              <Laptop className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">LMS & Assignment Activity</h3>
          </div>
          <dl className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Weekly LMS Logins</dt>
              <dd className="font-mono">{formatVal(raw.lms_logins, ' logins/wk')}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Assignment Completion Rate</dt>
              <dd className="font-mono">{formatVal(raw.assignment_completion, '%')}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Assignment Marks</dt>
              <dd className="font-mono">{formatVal(raw.assignments, '%')}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Online Learning Activity</dt>
              <dd className="font-mono">{formatVal(raw.learning_activity, ' / 10')}</dd>
            </div>
          </dl>
        </div>

        {/* 4. Placement Readiness */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
            <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
              <Award className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Placement Readiness</h3>
          </div>
          <dl className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Aptitude Test Score</dt>
              <dd className="font-mono">{formatVal(raw.aptitude, '%')}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Coding Assessment</dt>
              <dd className="font-mono">{formatVal(raw.coding_assessment, '%')}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Mock Interview Score</dt>
              <dd className="font-mono">{formatVal(raw.mock_interview, '%')}</dd>
            </div>
          </dl>
        </div>

        {/* 5. Engagement & Extracurriculars */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
              <Layers className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Campus Engagement</h3>
          </div>
          <dl className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Club Memberships</dt>
              <dd className="font-mono">{formatVal(raw.clubs)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Events Participated</dt>
              <dd className="font-mono">{formatVal(raw.events)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Hackathons Entered</dt>
              <dd className="font-mono">{formatVal(raw.hackathons)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Industry Certifications</dt>
              <dd className="font-mono">{formatVal(raw.certifications)}</dd>
            </div>
          </dl>
        </div>

        {/* 6. Skills & Stakeholder Feedback */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <MessageSquare className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Skills & Feedback</h3>
          </div>
          <dl className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Technical Skills Index</dt>
              <dd className="font-mono">{formatVal(raw.technical_skills, '%')}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Soft Skills Evaluation</dt>
              <dd className="font-mono">{formatVal(raw.soft_skills, '%')}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Student Satisfaction</dt>
              <dd className="font-mono">{formatVal(raw.student_satisfaction, '%')}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Faculty Feedback Score</dt>
              <dd className="font-mono">{formatVal(raw.faculty_feedback, '%')}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Success Score Calculation Breakdown */}
      {score && (
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Success Score Component Breakdown</h3>
              <p className="text-xs text-slate-500">Observed category scores and their points in the overall score. Missing categories contribute no data and observed weights are renormalized.</p>
            </div>
            <span className="text-xs font-mono text-slate-500">
              {score.categories_observed} / 7 Categories Available
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {Object.entries(score.category_scores).map(([category, catScore]) => (
              <div key={category} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 capitalize truncate">
                  {category}
                </p>
                <p className="text-base font-bold text-slate-900 font-mono mt-1">
                  {catScore !== null ? `${catScore}%` : <span className="text-slate-400 text-xs font-normal">N/A</span>}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Weight: {Math.round((score.weights[category] || 0) * 100)}%
                </p>
                <p className="text-[10px] text-indigo-700 mt-0.5">
                  {catScore !== null && score.coverage > 0
                    ? `Contribution: ${(catScore * (score.weights[category] || 0) / score.coverage).toFixed(1)} pts`
                    : 'No contribution'}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 p-3 bg-slate-50 rounded-lg text-[11px] text-slate-500 flex items-start gap-2">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <span>{score.method}</span>
          </div>
        </div>
      )}

      <section className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs space-y-3" aria-label="Structured student observations">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Academic and support evidence</h3>
          <p className="text-xs text-slate-500">Dated records are shown from imports. Missing records are not assumed to be zero.</p>
        </div>
        {student.observations?.length ? <div className="overflow-x-auto rounded-lg border border-slate-100">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600"><tr>
              <th className="px-3 py-2">Date</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Measure</th>
              <th className="px-3 py-2">Subject / detail</th><th className="px-3 py-2">Value</th><th className="px-3 py-2">Source</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">{student.observations.map((record) => <tr key={record.id}>
              <td className="px-3 py-2">{record.observed_at || 'Date not supplied'}</td>
              <td className="px-3 py-2 capitalize">{record.category}</td>
              <td className="px-3 py-2">{record.metric}</td>
              <td className="px-3 py-2">{record.subject || record.record_type}</td>
              <td className="px-3 py-2">{record.value ?? 'Not measured'}{record.synthetic ? ' · Synthetic demo' : ''}</td>
              <td className="px-3 py-2">{record.source}</td>
            </tr>)}</tbody>
          </table>
        </div> : <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-xs text-slate-500">
          No structured academic, attendance, LMS, engagement, placement, skills, or feedback records are stored for this student.
        </div>}
      </section>

      {/* Interventions History & Workflow */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
              <ClipboardList className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Recorded Interventions</h3>
              <p className="text-xs text-slate-500">Support actions assigned to this student</p>
            </div>
          </div>
          <button
            onClick={() => setIsInterventionModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-2xs"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Log Action</span>
          </button>
        </div>

        {student.interventions && student.interventions.length > 0 ? (
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
            {student.interventions.map((item) => (
              <div key={item.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={item.status} />
                    <span className="text-xs font-semibold text-slate-800">{item.description}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                    <span>Owner: <strong>{item.owner || 'Unassigned'}</strong></span>
                    <span>·</span>
                    <span>Follow-up: <strong>{item.follow_up_date || 'No date set'}</strong></span>
                    <span>·</span>
                    <span className="text-slate-400">Created: {item.created_at}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
            No support interventions recorded yet. Use "Log Action" to demonstrate a follow-up in the guest sandbox.
          </div>
        )}
      </div>

      {/* Create Intervention Dialog */}
      <Dialog
        open={isInterventionModalOpen}
        onClose={() => setIsInterventionModalOpen(false)}
        title={`Log Support Intervention for ${student.student_id}`}
      >
        <form onSubmit={handleCreateIntervention} className="space-y-4">
          {interventionErrorMsg && <Alert type="error" title="Intervention could not be saved">{interventionErrorMsg}</Alert>}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Action Description <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              placeholder="e.g., Scheduled remedial tutoring for mathematics backlogs..."
              value={actionDesc}
              onChange={(e) => setActionDesc(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Assigned Faculty / Counselor Owner
              </label>
              <input
                type="text"
                placeholder="e.g., Dr. Sharma"
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
              onClick={() => setIsInterventionModalOpen(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingIntervention || !actionDesc.trim()}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {submittingIntervention ? 'Saving...' : 'Save Intervention'}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
