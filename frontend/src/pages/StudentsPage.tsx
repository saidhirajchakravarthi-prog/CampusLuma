import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { Header } from '../components/layout/Header';
import { TableSkeleton } from '../components/ui/LoadingSkeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { Alert } from '../components/ui/Alert';
import { downloadBlob } from '../downloads';
import { PaginatedStudents } from '../api/types';
import { RiskBadge, Badge } from '../components/ui/Badge';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Filter,
  Download,
  Users,
  Eye,
  RefreshCw,
} from 'lucide-react';

type SortField = 'student_id' | 'name' | 'score' | 'department';
const EMPTY_STUDENT_LIST: PaginatedStudents['items'] = [];

function SortHeader({ label, field, sortField, sortAsc, onSort }: {
  label: string;
  field: SortField;
  sortField: SortField;
  sortAsc: boolean;
  onSort: (field: SortField) => void;
}) {
  return (
    <th aria-sort={sortField === field ? (sortAsc ? 'ascending' : 'descending') : 'none'} className="py-2 px-3">
      <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-slate-100 focus-visible:outline-indigo-600">
        <span>{label}</span><ArrowUpDown className="h-3 w-3 text-slate-400" aria-hidden="true" />
        <span className="sr-only">{sortField === field ? (sortAsc ? 'sorted ascending' : 'sorted descending') : 'not sorted'}</span>
      </button>
    </th>
  );
}

export function StudentsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedSem, setSelectedSem] = useState('');
  const [selectedCohort, setSelectedCohort] = useState('');
  const [selectedRisk, setSelectedRisk] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortField, setSortField] = useState<SortField>('student_id');
  const [sortAsc, setSortAsc] = useState(true);

  // Fetch departments list for filter
  const { data: departments } = useApi(() => api.getDepartments(), []);
  const { data: cohortGroups } = useApi(() => api.getCohorts(), []);
  const cohorts = [...new Set((cohortGroups || []).map((group) => group.cohort).filter((cohort) => cohort && cohort !== 'Unspecified'))].sort();

  // Fetch paginated students
  const {
    data: studentsResult,
    loading,
    error,
    refetch,
  } = useApi(
    () =>
      api.getStudents({
        search: searchTerm || undefined,
        department: selectedDept || undefined,
        semester: selectedSem || undefined,
        cohort: selectedCohort || undefined,
        risk_level: selectedRisk || undefined,
        page: currentPage,
        page_size: pageSize,
      }),
    [searchTerm, selectedDept, selectedSem, selectedCohort, selectedRisk, currentPage, pageSize]
  );

  const studentsList = studentsResult?.items ?? EMPTY_STUDENT_LIST;
  const totalStudents = studentsResult?.total || 0;
  const totalPages = studentsResult?.pages || 1;

  // Sorting
  const sortedStudents = useMemo(() => {
    return [...studentsList].sort((a, b) => {
      let valA: any = '';
      let valB: any = '';
      if (sortField === 'student_id') {
        valA = a.student_id;
        valB = b.student_id;
      } else if (sortField === 'name') {
        valA = a.data?.name || '';
        valB = b.data?.name || '';
      } else if (sortField === 'department') {
        valA = a.department || '';
        valB = b.department || '';
      } else if (sortField === 'score') {
        valA = a.success_score?.score ?? -1;
        valB = b.success_score?.score ?? -1;
      }
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [studentsList, sortField, sortAsc]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const handleExportCSV = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const blob = await api.downloadReport('csv');
      downloadBlob(blob, 'campusluma_students.csv');
    } catch (err: any) {
      setExportError(err instanceof Error ? err.message : 'Student export failed.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Header
        title="Student Directory"
        subtitle="Search, filter, and inspect detailed student academic and engagement profiles"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              aria-label="Refresh student records"
              className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              title="Refresh records"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={handleExportCSV}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              <span>{exporting ? 'Preparing export…' : 'Export all accessible students'}</span>
            </button>
          </div>
        }
      />

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex flex-col md:flex-row md:flex-wrap items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            aria-label="Search students by ID or name"
            type="text"
            placeholder="Search by student ID or student name..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-colors"
          />
        </div>

        {/* Department Filter */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0 hidden sm:inline" />
          <select
            aria-label="Filter by department"
            value={selectedDept}
            onChange={(e) => {
              setSelectedDept(e.target.value);
              setCurrentPage(1);
            }}
            className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 w-full md:w-48"
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
            aria-label="Filter by semester"
            value={selectedSem}
            onChange={(e) => {
              setSelectedSem(e.target.value);
              setCurrentPage(1);
            }}
            className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 w-full md:w-32"
          >
            <option value="">All Semesters</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
              <option key={s} value={String(s)}>
                Sem {s}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by cohort"
            value={selectedCohort}
            onChange={(e) => { setSelectedCohort(e.target.value); setCurrentPage(1); }}
            className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 w-full md:w-36"
          >
            <option value="">All Cohorts</option>
            {cohorts.map((cohort) => <option key={cohort} value={cohort}>{cohort}</option>)}
          </select>
          <select
            aria-label="Filter by risk tier"
            value={selectedRisk}
            onChange={(e) => { setSelectedRisk(e.target.value); setCurrentPage(1); }}
            className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 w-full md:w-36"
          >
            <option value="">All Risk Tiers</option>
            <option value="High Risk">High Risk</option>
            <option value="Medium Risk">Medium Risk</option>
            <option value="Low Risk">Low Risk</option>
            <option value="Unknown">Insufficient data</option>
          </select>
          {(searchTerm || selectedDept || selectedSem || selectedCohort || selectedRisk) && (
            <button type="button" onClick={() => { setSearchTerm(''); setSelectedDept(''); setSelectedSem(''); setSelectedCohort(''); setSelectedRisk(''); setCurrentPage(1); }} className="text-xs font-medium text-indigo-700 underline underline-offset-2">Clear filters</button>
          )}
        </div>
      </div>

      {exportError && <Alert type="error" title="Student export failed">{exportError}</Alert>}

      {error && (
        <Alert type="error" title="Failed to fetch student records">
          {error}
        </Alert>
      )}

      {/* Directory Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : sortedStudents.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No matching student records found"
            description={
              searchTerm || selectedDept || selectedSem || selectedCohort || selectedRisk
                ? 'Try broadening your search query or resetting active filters.'
                : 'No student records currently exist in the database. Use Data Import to upload student data.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                  <SortHeader label="Student ID" field="student_id" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader label="Name" field="name" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader label="Department" field="department" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <th className="py-3 px-4">Semester</th>
                  <th className="py-3 px-4">Cohort</th>
                  <th className="py-3 px-4">Data Origin</th>
                  <SortHeader label="Success Score" field="score" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <th className="py-3 px-4">Coverage</th>
                  <th className="py-3 px-4">Risk Tier</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedStudents.map((student) => {
                  const scoreObj = student.success_score;
                  const hasScore = scoreObj && scoreObj.reliable && scoreObj.score !== null;
                  const scoreVal = scoreObj?.score;
                  const riskLevel =
                    !hasScore
                      ? 'Unknown'
                      : (scoreVal ?? 100) < 40
                      ? 'High Risk'
                      : (scoreVal ?? 100) < 65
                      ? 'Medium Risk'
                      : 'Low Risk';

                  return (
                    <tr
                      key={student.student_id}
                      className="hover:bg-slate-50/70 transition-colors group"
                    >
                      <td className="py-3 px-4 font-mono font-medium text-slate-900">
                        {student.student_id}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">
                        <Link
                          to={`/students/${student.student_id}`}
                          className="hover:text-indigo-600 transition-colors"
                        >
                          {student.data?.name || '—'}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{student.department || '—'}</td>
                      <td className="py-3 px-4 text-slate-600 font-mono">
                        {student.semester ? `Sem ${student.semester}` : '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono">{student.cohort || '—'}</td>
                      <td className="py-3 px-4 text-slate-600">{student.data?.data_origin || 'Unspecified'}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {hasScore ? (
                          <span className="font-mono">{scoreVal}%</span>
                        ) : (
                          <span className="text-slate-400 font-normal italic">Insufficient data</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <div className="w-12 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-indigo-600 h-full rounded-full"
                              style={{ width: `${scoreObj?.coverage_percent ?? 0}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {scoreObj?.coverage_percent ?? 0}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {hasScore ? (
                          <RiskBadge level={riskLevel} />
                        ) : (
                          <Badge variant="neutral">Provisional</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link
                          to={`/students/${student.student_id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Profile</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalStudents > 0 && (
          <div className="p-3.5 bg-slate-50/50 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>Showing {sortedStudents.length} of {totalStudents} students</span>
              <span className="text-slate-300">|</span>
              <div className="flex items-center gap-1">
                <span>Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-700"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-700">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1 || loading}
                  className="p-1 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages || loading}
                  className="p-1 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
