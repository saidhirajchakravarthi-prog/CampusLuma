import {
  OverviewData,
  DepartmentOverview,
  StudentRecord,
  PaginatedStudents,
  AtRiskStudent,
  SegmentStudent,
  CohortData,
  ObservationAnalytics,
  ImportResult,
  ImportRecord,
  Intervention,
  InterventionHistoryEntry,
  CreateInterventionInput,
  UpdateInterventionInput,
  PredictionInput,
  PredictionResult,
  ModelStatus,
  LoginResponse,
  SessionResponse,
} from './types';

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

class ApiClient {
  private token: string | null = null;
  private readonly baseUrl = configuredApiBaseUrl
    ? configuredApiBaseUrl.replace(/\/+$/, '')
    : '/api';

  constructor() {
    this.token = localStorage.getItem('siq_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('siq_token', token);
    } else {
      localStorage.removeItem('siq_token');
    }
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('siq_token');
    }
    return this.token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timeoutMs = path.startsWith('/auth/') ? 20_000 : 30_000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 401 && !path.startsWith('/auth/login')) {
          this.setToken(null);
          window.dispatchEvent(new Event('siq:session-expired'));
        }
        let errorMessage = `HTTP Error ${response.status}: ${response.statusText}`;
        try {
          const errorJson = await response.json();
          if (errorJson && errorJson.detail) {
            errorMessage = typeof errorJson.detail === 'string' ? errorJson.detail : JSON.stringify(errorJson.detail);
          }
        } catch {
          // Keep default message when the API did not return JSON.
        }
        throw new ApiError(response.status, errorMessage);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      return await response.blob() as unknown as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiError(0, `The API did not respond within ${timeoutMs / 1000} seconds. Check that FastAPI is running and its Firebase settings are correct.`);
      }
      throw new ApiError(0, 'Could not reach the CampusLuma API. Check VITE_API_BASE_URL or confirm FastAPI is running behind the local Vite proxy.');
    } finally {
      clearTimeout(timeout);
    }
  }

  // Authentication & Session
  async login(email: string, password: string): Promise<LoginResponse> {
    const result = await this.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (result && result.access_token) {
      this.setToken(result.access_token);
    }
    return result;
  }

  async loginWithFirebase(idToken: string): Promise<LoginResponse> {
    const result = await this.request<LoginResponse>('/auth/firebase', {
      method: 'POST',
      body: JSON.stringify({ id_token: idToken }),
    });
    if (result?.access_token) this.setToken(result.access_token);
    return result;
  }

  async createGuestSession(): Promise<LoginResponse> {
    const result = await this.request<LoginResponse>('/auth/guest-session', { method: 'POST' });
    if (result?.access_token) this.setToken(result.access_token);
    return result;
  }

  async logout(): Promise<void> {
    const token = this.getToken();
    // Clear browser storage synchronously; retain the captured token only for the best-effort server notice.
    this.setToken(null);
    try {
      await this.request<{ message: string }>('/auth/logout', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      // Ignore network errors during logout
    } finally {
      this.setToken(null);
    }
  }

  async validateSession(): Promise<SessionResponse> {
    return this.request<SessionResponse>('/session');
  }

  // Campus Overview
  async getOverview(): Promise<OverviewData> {
    return this.request<OverviewData>('/overview');
  }

  async getDepartmentOverview(): Promise<DepartmentOverview[]> {
    return this.request<DepartmentOverview[]>('/overview/departments');
  }

  // Students Directory & Profiles
  async getStudents(params?: {
    search?: string;
    department?: string;
    semester?: string;
    cohort?: string;
    risk_level?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedStudents> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.department) query.set('department', params.department);
    if (params?.semester) query.set('semester', params.semester);
    if (params?.cohort) query.set('cohort', params.cohort);
    if (params?.risk_level) query.set('risk_level', params.risk_level);
    query.set('page', String(params?.page || 1));
    query.set('page_size', String(params?.page_size || 25));

    const result = await this.request<any>(`/students?${query.toString()}`);
    if (Array.isArray(result)) {
      return {
        items: result,
        total: result.length,
        page: 1,
        page_size: result.length,
        pages: 1,
      };
    }
    return result as PaginatedStudents;
  }

  async getStudent(studentId: string): Promise<StudentRecord> {
    return this.request<StudentRecord>(`/students/${encodeURIComponent(studentId)}`);
  }

  async getDepartments(): Promise<string[]> {
    return this.request<string[]>('/students/departments');
  }

  // Early-Warning & Risk
  async getAtRisk(params?: {
    risk_level?: string;
    department?: string;
    semester?: string;
  }): Promise<AtRiskStudent[]> {
    const query = new URLSearchParams();
    if (params?.risk_level) query.set('risk_level', params.risk_level);
    if (params?.department) query.set('department', params.department);
    if (params?.semester) query.set('semester', params.semester);
    const qs = query.toString();
    return this.request<AtRiskStudent[]>(`/at-risk${qs ? `?${qs}` : ''}`);
  }

  // Segments & Cohorts
  async getAcademicStrongPlacementLow(): Promise<SegmentStudent[]> {
    return this.request<SegmentStudent[]>('/segments/academic-strong-placement-low');
  }

  async getCohorts(): Promise<CohortData[]> {
    return this.request<CohortData[]>('/cohorts');
  }

  async getObservationAnalytics(category?: string): Promise<ObservationAnalytics> {
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    return this.request<ObservationAnalytics>(`/analytics/observations${query}`);
  }

  // Data Imports
  async importFile(file: File, mapping?: Record<string, string>, dataType = 'students', syntheticConfirmed = false): Promise<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    const params = new URLSearchParams({ data_type: dataType, synthetic_confirmed: String(syntheticConfirmed) });
    if (mapping && Object.keys(mapping).length > 0) params.set('mapping', JSON.stringify(mapping));
    const query = `?${params.toString()}`;
    return this.request<ImportResult>(`/imports${query}`, {
      method: 'POST',
      body: formData,
    });
  }

  async getImports(): Promise<ImportRecord[]> {
    return this.request<ImportRecord[]>('/imports');
  }

  async getImport(importId: number): Promise<ImportRecord> {
    return this.request<ImportRecord>(`/imports/${importId}`);
  }

  // Interventions
  async getInterventions(): Promise<Intervention[]> {
    return this.request<Intervention[]>('/interventions');
  }

  async createIntervention(data: CreateInterventionInput): Promise<Intervention> {
    return this.request<Intervention>('/interventions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateIntervention(id: number, data: UpdateInterventionInput): Promise<Intervention> {
    return this.request<Intervention>(`/interventions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getInterventionHistory(id: number): Promise<InterventionHistoryEntry[]> {
    return this.request<InterventionHistoryEntry[]>(`/interventions/${id}/history`);
  }

  async restoreDemoWorkspace(): Promise<{ message: string; student_count: number }> {
    return this.request<{ message: string; student_count: number }>('/demo/reset', { method: 'POST', body: JSON.stringify({ confirm: 'RESTORE_DEMO' }) });
  }

  // Predictions & Model Status
  async predict(data: PredictionInput): Promise<PredictionResult> {
    return this.request<PredictionResult>('/predict', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getModelStatus(): Promise<ModelStatus> {
    return this.request<ModelStatus>('/model/status');
  }

  // Reports
  async downloadReport(type: 'xlsx' | 'csv' | 'pdf' | 'observations-csv'): Promise<Blob> {
    const paths = {
      xlsx: '/reports/students.xlsx',
      csv: '/reports/students.csv',
      pdf: '/reports/summary.pdf',
      'observations-csv': '/reports/observations.csv',
    };
    return this.request<Blob>(paths[type]);
  }
}

export const api = new ApiClient();
