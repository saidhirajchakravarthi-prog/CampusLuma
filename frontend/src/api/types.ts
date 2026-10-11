export interface UserInfo {
  email: string;
  name: string;
  role: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: UserInfo;
}

export interface SessionResponse {
  role: string;
  email?: string | null;
  name?: string | null;
  auth_type?: string;
}

export interface OverviewData {
  student_count: number;
  scored_students: number;
  insufficient_data: number;
  average_success_score: number | null;
  risk_distribution: Record<string, number>;
  average_attendance: number | null;
  average_placement_readiness: number | null;
  category_coverage: Record<string, number>;
  success_score_distribution: Record<string, number>;
  score_method: string;
}

export interface DepartmentOverview {
  department: string;
  student_count: number;
  avg_success_score: number | null;
  avg_attendance: number | null;
  avg_placement_readiness: number | null;
}

export interface SuccessScore {
  score: number | null;
  provisional_score: number | null;
  reliable: boolean;
  coverage: number;
  coverage_percent: number;
  categories_observed: number;
  indicators_observed: number;
  category_scores: Record<string, number | null>;
  weights: Record<string, number>;
  method: string;
}

export interface Intervention {
  id: number;
  student_id: string;
  description: string;
  status: string;
  owner: string | null;
  follow_up_date: string | null;
  created_at: string;
}

export interface InterventionHistoryEntry {
  id: number;
  action: 'created' | 'updated';
  status: string;
  owner: string | null;
  follow_up_date: string | null;
  actor?: string | null;
  changed_at: string;
}

export interface StudentRecord {
  student_id: string;
  department: string | null;
  semester: string | null;
  cohort: string | null;
  payload: string;
  source: string;
  updated_at: string;
  data: Record<string, any>;
  success_score: SuccessScore;
  interventions?: Intervention[];
  observations?: { id: number; category: string; record_type: string; observed_at: string | null; subject: string | null;
    metric: string; value: number | null; details: Record<string, unknown>; source: string; synthetic: number }[];
}

export interface PaginatedStudents {
  items: StudentRecord[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface AtRiskStudent {
  student_id: string;
  name: string | null;
  score: number;
  risk_level: string;
  data_coverage?: number;
  department?: string | null;
  semester?: string | null;
  contributing_factors: [string, number][];
}

export interface SegmentStudent {
  student_id: string;
  name: string | null;
  academic_score: number;
  placement_readiness: number;
  suggestion: string;
}

export interface CohortData {
  department: string;
  semester: string;
  cohort: string;
  students: number;
  scored_students: number;
  average_success_score: number | null;
}

export interface ObservationAnalytics {
  category: string | null;
  total_records: number;
  summaries: { category: string; metric: string; subject: string | null; term: string | null; records: number; students: number; valued_records: number; average: number | null }[];
  trends: { category: string; metric: string; subject: string | null; term: string | null; date: string; records: number; average: number }[];
  data_note: string;
}

export interface ImportError {
  row: number;
  student_id?: string;
  message: string;
}

export interface ImportResult {
  import_id: number;
  source: string;
  total_rows: number;
  imported_rows: number;
  error_count: number;
  errors: ImportError[];
  ignored_columns: string[];
  data_type?: string;
}

export interface ImportRecord {
  id: number;
  source: string;
  imported_at: string;
  total_rows: number;
  imported_rows: number;
  errors: ImportError[];
  data_type?: string;
}

export interface CreateInterventionInput {
  student_id: string;
  description: string;
  owner?: string | null;
  follow_up_date?: string | null;
}

export interface UpdateInterventionInput {
  status?: string;
  owner?: string | null;
  follow_up_date?: string | null;
}

export interface PredictionInput {
  study_hours?: number;
  attendance?: number;
  assignments?: number;
  quizzes?: number;
}

export interface PredictionResult {
  prediction: string;
  probability: number;
  risk_level: string;
  interventions: string[];
  data_coverage: number;
  interpretation_reliable: boolean;
  contributing_factors: { feature: string; value: number; rule: string }[];
  factor_method: string;
  experimental: boolean;
  model_note: string;
}

export interface ModelMetrics {
  evaluation: string;
  rows_train: number;
  rows_test: number;
  accuracy: number;
  balanced_accuracy: number;
  f1: number;
  roc_auc: number;
}

export interface ModelStatus {
  status: string;
  metrics: ModelMetrics | null;
  artifact_path?: string;
  experimental?: boolean;
  note: string;
}
