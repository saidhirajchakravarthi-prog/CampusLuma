import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/useAuth';
import { AppLayout } from './components/layout/AppLayout';
import { GraduationCap } from 'lucide-react';

const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const OverviewPage = lazy(() => import('./pages/OverviewPage').then((module) => ({ default: module.OverviewPage })));
const StudentsPage = lazy(() => import('./pages/StudentsPage').then((module) => ({ default: module.StudentsPage })));
const StudentProfilePage = lazy(() => import('./pages/StudentProfilePage').then((module) => ({ default: module.StudentProfilePage })));
const AtRiskPage = lazy(() => import('./pages/AtRiskPage').then((module) => ({ default: module.AtRiskPage })));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })));
const ImportsPage = lazy(() => import('./pages/ImportsPage').then((module) => ({ default: module.ImportsPage })));
const InterventionsPage = lazy(() => import('./pages/InterventionsPage').then((module) => ({ default: module.InterventionsPage })));
const PredictionsPage = lazy(() => import('./pages/PredictionsPage').then((module) => ({ default: module.PredictionsPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((module) => ({ default: module.ReportsPage })));
const ModelStatusPage = lazy(() => import('./pages/ModelStatusPage').then((module) => ({ default: module.ModelStatusPage })));

function ProtectedRoutes() {
  const { isAuthenticated, isLoading, role } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0b1329] flex flex-col items-center justify-center p-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600 text-white shadow-lg animate-pulse mb-3">
          <GraduationCap className="w-6 h-6" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Loading CampusLuma...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const isStaffOrAdmin = role === 'staff' || role === 'admin';
  const isGuest = role === 'guest';

  return (
    <Routes>
      <Route element={<AppLayout />}>
        {/* Core Accessible Pages */}
        <Route index element={<OverviewPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        {(isGuest || role === 'viewer' || role === 'analyst' || isStaffOrAdmin) && <Route path="predictions" element={<PredictionsPage />} />}
        {(isGuest || role === 'viewer' || role === 'analyst' || isStaffOrAdmin) && <Route path="model-status" element={<ModelStatusPage />} />}

        {/* Staff & Admin Restricted Pages */}
        {isStaffOrAdmin ? (
          <>
            <Route path="students" element={<StudentsPage />} />
            <Route path="students/:studentId" element={<StudentProfilePage />} />
            <Route path="at-risk" element={<AtRiskPage />} />
            <Route path="imports" element={<ImportsPage />} />
            <Route path="interventions" element={<InterventionsPage />} />
            <Route path="reports" element={<ReportsPage />} />
          </>
        ) : isGuest ? (
          <>
            <Route path="students" element={<StudentsPage />} />
            <Route path="students/:studentId" element={<StudentProfilePage />} />
            <Route path="at-risk" element={<AtRiskPage />} />
            <Route path="imports" element={<ImportsPage />} />
            <Route path="interventions" element={<InterventionsPage />} />
            <Route path="reports" element={<ReportsPage />} />
          </>
        ) : (
          <>
            <Route path="students/*" element={<Navigate to="/" replace />} />
            <Route path="at-risk" element={<Navigate to="/" replace />} />
            <Route path="imports" element={<Navigate to="/" replace />} />
            <Route path="interventions" element={<Navigate to="/" replace />} />
            <Route path="reports" element={<Navigate to="/" replace />} />
          </>
        )}

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<div className="min-h-screen bg-slate-50 p-8"><div className="mx-auto h-24 max-w-5xl animate-pulse rounded-2xl bg-white" /></div>}>
          <ProtectedRoutes />
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
