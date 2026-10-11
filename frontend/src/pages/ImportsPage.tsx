import { useState, useRef } from 'react';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { Header } from '../components/layout/Header';
import { TableSkeleton } from '../components/ui/LoadingSkeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Info,
  Clock,
  FileText,
  Check,
  ChevronRight,
  Database,
} from 'lucide-react';
import { ImportResult } from '../api/types';
import { useAuth } from '../contexts/useAuth';

const CANONICAL_FIELDS: { key: string; label: string; category: string; required?: boolean }[] = [
  { key: 'student_id', label: 'Student Identifier', category: 'Identity', required: true },
  { key: 'name', label: 'Student Full Name', category: 'Identity' },
  { key: 'department', label: 'Department / Major', category: 'Context' },
  { key: 'semester', label: 'Academic Semester (1-8)', category: 'Context' },
  { key: 'cohort', label: 'Graduation Cohort Year', category: 'Context' },
  { key: 'data_origin', label: 'Data Origin (synthetic/demo)', category: 'Provenance' },
  // Academic
  { key: 'cgpa', label: 'CGPA (0.0 - 10.0)', category: 'Academic' },
  { key: 'marks', label: 'Aggregate Marks (0 - 100)', category: 'Academic' },
  { key: 'backlogs', label: 'Active Backlog Count (0 - 100)', category: 'Academic' },
  { key: 'subject_performance', label: 'Subject Performance (0 - 100)', category: 'Academic' },
  // Attendance
  { key: 'attendance', label: 'Overall Attendance % (0 - 100)', category: 'Attendance' },
  { key: 'subject_attendance', label: 'Subject Attendance % (0 - 100)', category: 'Attendance' },
  { key: 'study_hours', label: 'Daily Study Hours (0 - 24)', category: 'Attendance' },
  // LMS
  { key: 'lms_logins', label: 'Weekly LMS Logins (0 - 10)', category: 'LMS Activity' },
  { key: 'assignment_completion', label: 'Assignment Completion % (0 - 100)', category: 'LMS Activity' },
  { key: 'assignments', label: 'Assignment Marks % (0 - 100)', category: 'LMS Activity' },
  { key: 'quizzes', label: 'Quiz Scores % (0 - 100)', category: 'LMS Activity' },
  { key: 'learning_activity', label: 'Learning Portal Activity (0 - 10)', category: 'LMS Activity' },
  // Engagement
  { key: 'clubs', label: 'Club Memberships (0 - 10)', category: 'Engagement' },
  { key: 'events', label: 'Events Participated (0 - 10)', category: 'Engagement' },
  { key: 'hackathons', label: 'Hackathons Entered (0 - 10)', category: 'Engagement' },
  { key: 'certifications', label: 'Industry Certifications (0 - 10)', category: 'Engagement' },
  // Placement
  { key: 'aptitude', label: 'Aptitude Test Score (0 - 100)', category: 'Placement' },
  { key: 'coding_assessment', label: 'Coding Assessment Score (0 - 100)', category: 'Placement' },
  { key: 'mock_interview', label: 'Mock Interview Evaluation (0 - 100)', category: 'Placement' },
  // Skills
  { key: 'technical_skills', label: 'Technical Skills Assessment (0 - 100)', category: 'Skills' },
  { key: 'soft_skills', label: 'Soft Skills Assessment (0 - 100)', category: 'Skills' },
  // Feedback
  { key: 'student_satisfaction', label: 'Student Satisfaction % (0 - 100)', category: 'Feedback' },
  { key: 'faculty_feedback', label: 'Faculty Feedback Rating (0 - 100)', category: 'Feedback' },
];

const STRUCTURED_IMPORTS = {
  students: { label: 'Student profiles and aggregate indicators', fields: CANONICAL_FIELDS },
  'subject-performance': { label: 'Subject assessments and backlogs', fields: [
    { key: 'student_id', label: 'Student Identifier', category: 'Required', required: true },
    { key: 'subject', label: 'Subject', category: 'Required', required: true },
    { key: 'term', label: 'Term / Semester', category: 'Academic' },
    { key: 'date', label: 'Assessment Date', category: 'Academic' },
    { key: 'marks', label: 'Marks (0 - 100)', category: 'Required', required: true },
    { key: 'backlogs', label: 'Backlog Count', category: 'Academic' },
  ] },
  'attendance-history': { label: 'Dated attendance sessions', fields: [
    { key: 'student_id', label: 'Student Identifier', category: 'Required', required: true },
    { key: 'date', label: 'Session Date', category: 'Required', required: true },
    { key: 'attended', label: 'Sessions Attended', category: 'Required', required: true },
    { key: 'held', label: 'Sessions Held', category: 'Required', required: true },
    { key: 'subject', label: 'Subject', category: 'Attendance' },
  ] },
  'lms-activity': { label: 'LMS activity and completion events', fields: [
    { key: 'student_id', label: 'Student Identifier', category: 'Required', required: true },
    { key: 'date', label: 'Event Date', category: 'Required', required: true },
    { key: 'event_type', label: 'Event Type', category: 'Required', required: true },
    { key: 'course', label: 'Course', category: 'LMS Activity' },
    { key: 'completion_percent', label: 'Completion % (0 - 100)', category: 'LMS Activity' },
    { key: 'duration_minutes', label: 'Duration Minutes', category: 'LMS Activity' },
  ] },
  'engagement-activity': { label: 'Clubs, events, hackathons and certifications', fields: [
    { key: 'student_id', label: 'Student Identifier', category: 'Required', required: true },
    { key: 'date', label: 'Activity Date', category: 'Required', required: true },
    { key: 'activity_type', label: 'Activity Type (club/event/hackathon/certification)', category: 'Required', required: true },
    { key: 'activity_name', label: 'Activity Name', category: 'Required', required: true },
  ] },
  'placement-assessment': { label: 'Aptitude, coding and mock interview assessments', fields: [
    { key: 'student_id', label: 'Student Identifier', category: 'Required', required: true },
    { key: 'date', label: 'Assessment Date', category: 'Required', required: true },
    { key: 'assessment_type', label: 'Type (aptitude/coding/mock_interview)', category: 'Required', required: true },
    { key: 'score', label: 'Score (0 - 100)', category: 'Required', required: true },
  ] },
  'skills-assessment': { label: 'Technical and soft-skill assessments', fields: [
    { key: 'student_id', label: 'Student Identifier', category: 'Required', required: true },
    { key: 'date', label: 'Assessment Date', category: 'Required', required: true },
    { key: 'skill_type', label: 'Type (technical/soft)', category: 'Required', required: true },
    { key: 'skill_name', label: 'Skill Name', category: 'Required', required: true },
    { key: 'score', label: 'Score (0 - 100)', category: 'Required', required: true },
  ] },
  feedback: { label: 'Student and faculty feedback scores', fields: [
    { key: 'student_id', label: 'Student Identifier', category: 'Required', required: true },
    { key: 'date', label: 'Feedback Date', category: 'Required', required: true },
    { key: 'respondent_type', label: 'Respondent (student/faculty)', category: 'Required', required: true },
    { key: 'score', label: 'Score (0 - 100)', category: 'Required', required: true },
    { key: 'feedback_category', label: 'Feedback Category', category: 'Feedback' },
  ] },
} as const;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell); cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

export function ImportsPage() {
  const { role } = useAuth();
  const isGuest = role === 'guest';
  const [dataType, setDataType] = useState<keyof typeof STRUCTURED_IMPORTS>('students');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({});
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [isUploading, setIsUploading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [syntheticConfirmed, setSyntheticConfirmed] = useState(false);
  const activeFields = dataType === 'students'
    ? STRUCTURED_IMPORTS[dataType].fields
    : [...STRUCTURED_IMPORTS[dataType].fields, { key: 'data_origin', label: 'Data Origin (e.g. synthetic/demo)', category: 'Provenance' }];
  const missingRequiredFields = activeFields.filter((field) =>
    (('required' in field && field.required) || (isGuest && field.key === 'data_origin'))
      && !fieldMappings[field.key]?.trim());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch import history
  const {
    data: importHistory,
    loading: historyLoading,
    error: historyError,
    refetch: refetchHistory,
  } = useApi(() => api.getImports(), []);

  // Parse CSV preview locally in browser
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setUploadError(null);
    setSyntheticConfirmed(false);
    setImportResult(null);

    const isCsv = file.name.toLowerCase().endsWith('.csv');
    if (isCsv) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (!text) return;
        try {
        const lines = parseCsv(text);
        if (lines.length > 0) {
          const headers = lines[0].map((h) => h.trim());
          setFileHeaders(headers);

          // Auto-match headers to canonical fields
          const initialMap: Record<string, string> = {};
          headers.forEach((header) => {
            const clean = header.toLowerCase().replace(/[^a-z0-9]/g, '');
            const match = activeFields.find((f) => {
              const fClean = f.key.toLowerCase().replace(/[^a-z0-9]/g, '');
              return fClean === clean || clean.includes(fClean) || fClean.includes(clean);
            });
            if (match) {
              initialMap[match.key] = header;
            }
          });
          setFieldMappings(initialMap);

          // Parse first 5 preview rows
          const previews = lines.slice(1, 6).map((values) => {
            const row: Record<string, string> = {};
            headers.forEach((h, i) => {
              row[h] = values[i] || '';
            });
            return row;
          });
          setPreviewRows(previews);
          setStep(2);
        }
        } catch (error) {
          setUploadError(error instanceof Error ? error.message : 'Could not preview CSV file.');
        }
      };
      reader.readAsText(file);
    } else {
      // Excel workbook: cannot trivially parse in pure browser JS without xlsx bundle,
      // so we advance to step 2 with default input mapping option
      setFileHeaders([]);
      setPreviewRows([]);
      setStep(2);
    }
  };

  const handleExecuteImport = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      const result = await api.importFile(selectedFile, fieldMappings, dataType, syntheticConfirmed);
      setImportResult(result);
      setStep(4);
      refetchHistory();
    } catch (err: any) {
      setUploadError(err.message || 'Import failed to process on server.');
    } finally {
      setIsUploading(false);
    }
  };

  const resetWorkflow = () => {
    setSelectedFile(null);
    setFileHeaders([]);
    setPreviewRows([]);
    setFieldMappings({});
    setImportResult(null);
    setUploadError(null);
    setSyntheticConfirmed(false);
    setStep(1);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <Header
        title="Data Import & Data Quality"
        subtitle="Multi-category CSV & Excel upload with schema validation and partial update preservation"
      />

      {step === 1 && <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs max-w-xl">
        <label htmlFor="import-data-type" className="block text-xs font-semibold text-slate-700 mb-2">Data type</label>
        <select id="import-data-type" value={dataType} onChange={(e) => {
          setDataType(e.target.value as keyof typeof STRUCTURED_IMPORTS);
          setFieldMappings({});
        }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
          {Object.entries(STRUCTURED_IMPORTS).map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}
        </select>
        <p className="mt-2 text-xs text-slate-500">Structured record imports require student IDs already present in the student profile import.</p>
      </div>}

      {/* Workflow Step Indicator */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          {[
            { num: 1, label: 'Select File' },
            { num: 2, label: 'Map Columns' },
            { num: 3, label: 'Review & Verify' },
            { num: 4, label: 'Results' },
          ].map((st, i) => (
            <div key={st.num} className="flex items-center">
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    step >= st.num
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-400 border border-slate-200'
                  }`}
                >
                  {step > st.num ? <Check className="w-3.5 h-3.5" /> : st.num}
                </div>
                <span
                  className={`text-xs font-medium hidden sm:inline ${
                    step >= st.num ? 'text-slate-800' : 'text-slate-400'
                  }`}
                >
                  {st.label}
                </span>
              </div>
              {i < 3 && <ChevronRight className="w-4 h-4 text-slate-300 mx-3 sm:mx-4" />}
            </div>
          ))}
        </div>
      </div>

      {uploadError && (
        <Alert type="error" title="Import Failed">
          {uploadError}
        </Alert>
      )}

      {isGuest && <div role="note" className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-xs text-teal-950">
        Guest imports are stored only in this isolated demo workspace. Map a <strong>data_origin</strong> column whose every row is labelled synthetic/demo; unknown provenance is rejected.
      </div>}

      {/* STEP 1: Select File */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-slate-200/80 p-8 shadow-xs text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
            id="file-upload-input"
          />
          <div className="max-w-md mx-auto space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto shadow-2xs">
              <UploadCloud className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Upload Student Data Spreadsheet</h3>
              <p className="text-xs text-slate-500 mt-1">
                Supports CSV, Excel (.xlsx, .xls) workbooks. Minimum requirement: <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-indigo-600">student_id</code> column.
              </p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Choose File from Computer</span>
            </button>
            <div className="p-3 bg-slate-50 rounded-xl text-[11px] text-slate-500 text-left border border-slate-100 space-y-1">
              <span className="font-semibold text-slate-700 block">Preservation Policy:</span>
              <span>
                Partial file updates will safely merge into existing student records without overwriting omitted columns with zero.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Map Columns */}
      {step === 2 && selectedFile && (
        <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900">Configure Canonical Header Mapping</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                File: <strong>{selectedFile.name}</strong> ({Math.round(selectedFile.size / 1024)} KB)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={resetWorkflow}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={missingRequiredFields.length > 0}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <span>Proceed to Verification</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs text-indigo-900 flex items-start gap-2">
            <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              Map every required field to its matching source column. Required fields: <strong className="font-mono">{activeFields.filter((field) => 'required' in field && field.required).map((field) => field.key).join(', ')}</strong>.
              Unmapped columns will be safely ignored without disrupting the import.
            </div>
          </div>
          {missingRequiredFields.length > 0 && <p role="status" className="text-xs text-amber-800">Select or enter a source column for: {missingRequiredFields.map((field) => field.label).join(', ')}.</p>}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeFields.map((field) => (
              <div key={field.key} className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/60 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">
                    {field.label} {(('required' in field && field.required) || (isGuest && field.key === 'data_origin')) && <span className="text-rose-500">*</span>}
                  </span>
                  <Badge variant={'required' in field && field.required ? 'danger' : 'neutral'} size="sm">
                    {field.category}
                  </Badge>
                </div>
                <div className="text-[10px] text-slate-400 font-mono">canonical: {field.key}</div>
                {fileHeaders.length > 0 ? (
                  <select
                    aria-label={`Source column for ${field.label}`}
                    value={fieldMappings[field.key] || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFieldMappings((prev) => ({
                        ...prev,
                        [field.key]: val,
                      }));
                    }}
                    className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">-- Leave Unmapped --</option>
                    {fileHeaders.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    aria-label={`Source column for ${field.label}`}
                    type="text"
                    placeholder="Source column name in Excel..."
                    value={fieldMappings[field.key] || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFieldMappings((prev) => ({
                        ...prev,
                        [field.key]: val,
                      }));
                    }}
                    className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-xs text-slate-700"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STEP 3: Preview & Confirm */}
      {step === 3 && selectedFile && (
        <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-xs space-y-6">
          {isGuest && <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-950">
            <input type="checkbox" checked={syntheticConfirmed} onChange={(event) => setSyntheticConfirmed(event.target.checked)} className="mt-0.5 accent-indigo-600" />
            <span>I confirm every row contains synthetic or demo data. This file will be written only to the guest sandbox.</span>
          </label>}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900">Data Sample Preview & Pre-Validation</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                First 5 rows from {selectedFile.name} with configured header mappings applied
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setStep(2)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Back to Mapping
              </button>
              <button
                onClick={handleExecuteImport}
                disabled={isUploading || (isGuest && !syntheticConfirmed)}
                className="px-5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 shadow-2xs cursor-pointer"
              >
                {isUploading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Executing Database Import...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-3.5 h-3.5" />
                    <span>Confirm & Execute Import</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Mapping Summary Chips */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-700">Active Field Mappings:</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(fieldMappings)
                .filter(([, source]) => source && source.trim().length > 0)
                .map(([canonical, source]) => (
                  <span
                    key={canonical}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-50 border border-indigo-100 text-xs text-indigo-900 font-mono"
                  >
                    <span className="text-slate-500">{source}</span>
                    <ArrowRight className="w-3 h-3 text-indigo-400" />
                    <span className="font-semibold text-indigo-700">{canonical}</span>
                  </span>
                ))}
            </div>
          </div>

          {/* Sample Rows Table */}
          {previewRows.length > 0 && (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                    {fileHeaders.map((h) => (
                      <th key={h} className="py-2.5 px-3 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/70">
                      {fileHeaders.map((h) => (
                        <td key={h} className="py-2.5 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                          {row[h] || <span className="text-slate-300 italic">null</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* STEP 4: Results */}
      {step === 4 && importResult && (
        <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Import Batch Finished</h3>
                <p className="text-xs text-slate-500">Source: {importResult.source}</p>
              </div>
            </div>
            <button
              onClick={resetWorkflow}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
            >
              Import Another File
            </button>
          </div>

          {/* Metric Counts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total Records</span>
              <p className="text-xl font-bold text-slate-800 font-mono mt-1">{importResult.total_rows}</p>
            </div>
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Imported / Updated</span>
              <p className="text-xl font-bold text-emerald-700 font-mono mt-1">{importResult.imported_rows}</p>
            </div>
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-700">Rejected Rows</span>
              <p className="text-xl font-bold text-rose-700 font-mono mt-1">{importResult.error_count}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Ignored Columns</span>
              <p className="text-xl font-bold text-slate-600 font-mono mt-1">{importResult.ignored_columns?.length || 0}</p>
            </div>
          </div>

          {/* Ignored columns chip list */}
          {importResult.ignored_columns && importResult.ignored_columns.length > 0 && (
            <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900 space-y-1">
              <span className="font-semibold block">Unrecognized Columns Ignored:</span>
              <p className="text-[11px] font-mono text-amber-800">
                {importResult.ignored_columns.join(', ')}
              </p>
            </div>
          )}

          {/* Row-by-Row Error Details */}
          {importResult.errors && importResult.errors.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>Actionable Validation Errors ({importResult.errors.length})</span>
              </h4>
              <div className="max-h-60 overflow-y-auto border border-rose-200 rounded-xl divide-y divide-rose-100">
                {importResult.errors.map((err, i) => (
                  <div key={i} className="p-3 bg-rose-50/40 text-xs flex items-center justify-between gap-3">
                    <span className="font-mono text-rose-900">
                      Row {err.row} {err.student_id ? `(${err.student_id})` : ''}
                    </span>
                    <span className="text-rose-700 font-medium">{err.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Historical Imports Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-900">Database Import History</h3>
          </div>
          <button
            onClick={() => refetchHistory()}
            aria-label="Refresh import history"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Refresh import history"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {historyLoading ? (
          <TableSkeleton rows={4} cols={4} />
        ) : historyError ? (
          <Alert type="error" title="Could not load import history">{historyError}</Alert>
        ) : !importHistory || importHistory.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No past imports recorded"
            description="Historical import logs and validation audits will be displayed here."
          />
        ) : (
          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-4">Batch ID</th>
                  <th className="py-2.5 px-4">Source File</th>
                  <th className="py-2.5 px-4">Data Type</th>
                  <th className="py-2.5 px-4">Imported At</th>
                  <th className="py-2.5 px-4">Total Rows</th>
                  <th className="py-2.5 px-4">Saved Rows</th>
                  <th className="py-2.5 px-4">Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {importHistory.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-4 font-mono font-medium text-slate-700">#{rec.id}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{rec.source}</td>
                    <td className="py-2.5 px-4">{rec.data_type || 'students'}</td>
                    <td className="py-2.5 px-4 text-slate-500 font-mono text-[11px]">{rec.imported_at}</td>
                    <td className="py-2.5 px-4 font-mono">{rec.total_rows}</td>
                    <td className="py-2.5 px-4 font-mono font-semibold text-emerald-700">{rec.imported_rows}</td>
                    <td className="py-2.5 px-4">
                      {rec.errors?.length > 0 ? (
                        <Badge variant="danger">{rec.errors.length} Errors</Badge>
                      ) : (
                        <Badge variant="success">Clean</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

