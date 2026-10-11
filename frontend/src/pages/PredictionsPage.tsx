import { useState } from 'react';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { Header } from '../components/layout/Header';
import { Alert } from '../components/ui/Alert';
import { Badge, RiskBadge } from '../components/ui/Badge';
import {
  Sparkles,
  ShieldAlert,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import { PredictionResult } from '../api/types';

export function PredictionsPage() {
  const [studyHours, setStudyHours] = useState<number>(4);
  const [attendance, setAttendance] = useState<number>(75);
  const [assignments, setAssignments] = useState<number>(65);
  const [quizzes, setQuizzes] = useState<number>(60);
  const [isPredicting, setIsPredicting] = useState(false);
  const [predictionResult, setPredictionResult] = useState<PredictionResult | null>(null);
  const [predictError, setPredictError] = useState<string | null>(null);

  // Fetch model status and saved evaluation metrics from backend
  const {
    data: modelStatus,
    loading: statusLoading,
    error: statusError,
  } = useApi(() => api.getModelStatus(), []);

  const isModelTrained = modelStatus?.status === 'trained';
  const metrics = modelStatus?.metrics;

  const handleRunPrediction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isModelTrained) return;
    setIsPredicting(true);
    setPredictError(null);
    try {
      const result = await api.predict({
        study_hours: studyHours,
        attendance: attendance,
        assignments: assignments,
        quizzes: quizzes,
      });
      setPredictionResult(result);
    } catch (err: any) {
      setPredictError(err.message || 'Prediction service call failed.');
    } finally {
      setIsPredicting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Header
        title="Predictive Classifier & Model Transparency"
        subtitle="Experimental machine learning pipeline status, held-out evaluation audit, and inference interface"
      />
      {statusError && <Alert type="error" title="Model status unavailable">{statusError}</Alert>}

      {/* Model Transparency and Evaluation Status Strip */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${isModelTrained ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">RandomForest Academic Outcome Classifier</h3>
                <Badge variant={isModelTrained ? 'success' : 'warning'}>
                  {isModelTrained ? 'Trained Artifact Available' : 'Artifact Missing'}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Pipeline: Imputer (median) → StandardScaler → Balanced Random Forest (300 estimators)
              </p>
            </div>
          </div>
        </div>

        {statusLoading ? (
          <div className="h-16 bg-slate-100 rounded-lg animate-pulse" />
        ) : isModelTrained && metrics ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Held-Out Accuracy</span>
                <p className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                  {(metrics.accuracy * 100).toFixed(1)}%
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Balanced Accuracy</span>
                <p className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                  {(metrics.balanced_accuracy * 100).toFixed(1)}%
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">F1 Score</span>
                <p className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                  {metrics.f1.toFixed(3)}
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">ROC AUC</span>
                <p className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                  {metrics.roc_auc.toFixed(3)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 bg-slate-50/70 p-2.5 rounded-lg border border-slate-100">
              <div>
                <strong>Evaluation methodology:</strong> {metrics.evaluation} · Train set: {metrics.rows_train} rows · Test set: {metrics.rows_test} rows
              </div>
              <span className="font-mono text-slate-400">models/model.pkl</span>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
            <p className="font-semibold">Model Artifact Missing</p>
            <p className="text-[11px]">{modelStatus?.note || 'Run `python -m src.train` to train the classifier.'}</p>
          </div>
        )}
      </div>

      {/* Model Limitations Notice */}
      <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600 flex items-start gap-2.5 shadow-2xs">
        <ShieldAlert className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
        <div className="space-y-1 leading-relaxed">
          <p className="font-bold text-slate-800">Responsible AI & Academic Integrity Notice</p>
          <p className="text-[11px] text-slate-500">
            This predictive classifier is an experimental model trained on synthetic development data (<code className="font-mono text-slate-600">data/student_data.csv</code>).
            It is provided solely for technical challenge evaluation. It does NOT possess validation on real human student cohorts.
            High prediction accuracy reflects synthetic data generation distributions and must not be used as authoritative ground truth for institutional decisions.
          </p>
        </div>
      </div>

      {/* Interactive Inference Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-xs space-y-5">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-600" />
              <span>Inference Simulation Parameters</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Simulate individual student indicators to evaluate pass probability and rule-based support actions.
            </p>
          </div>

          <form onSubmit={handleRunPrediction} className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <label className="font-medium text-slate-700">Daily Study Hours (0 - 24)</label>
                <span className="font-mono font-bold text-slate-900">{studyHours} hrs</span>
              </div>
              <input
                type="range"
                min={0}
                max={14}
                step={0.5}
                value={studyHours}
                onChange={(e) => setStudyHours(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <label className="font-medium text-slate-700">Attendance Percentage (0 - 100%)</label>
                <span className="font-mono font-bold text-slate-900">{attendance}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={attendance}
                onChange={(e) => setAttendance(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <label className="font-medium text-slate-700">Assignments Score (0 - 100%)</label>
                <span className="font-mono font-bold text-slate-900">{assignments}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={assignments}
                onChange={(e) => setAssignments(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <label className="font-medium text-slate-700">Quizzes Score (0 - 100%)</label>
                <span className="font-mono font-bold text-slate-900">{quizzes}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={quizzes}
                onChange={(e) => setQuizzes(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>

            <button
              type="submit"
              disabled={isPredicting || !isModelTrained}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white font-semibold text-xs shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {isPredicting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Evaluating Model Pipeline...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Academic Risk Inference</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Prediction Results Box */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">Inference Response & Contributing Factors</h3>
            <p className="text-xs text-slate-500 mt-0.5">Model probability output and heuristic intervention advice</p>
          </div>

          {predictError && (
            <Alert type="error" title="Prediction failed">
              {predictError}
            </Alert>
          )}

          {predictionResult ? (
            <div className="space-y-4 flex-1">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Class Prediction</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xl font-black ${predictionResult.prediction === 'Pass' ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {predictionResult.prediction}
                    </span>
                    <RiskBadge level={predictionResult.risk_level} />
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Pass Probability</span>
                  <p className="text-xl font-mono font-black text-slate-900 mt-1">
                    {(predictionResult.probability * 100).toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* Rule-based contributing factors */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-800">Identified Contributing Factors:</span>
                {predictionResult.contributing_factors.length > 0 ? (
                  <div className="space-y-1.5">
                    {predictionResult.contributing_factors.map((cf, i) => (
                      <div key={i} className="p-2 bg-amber-50 rounded-lg border border-amber-100 text-xs flex items-center justify-between">
                        <span className="font-medium text-amber-900 capitalize">{cf.feature.replace('_', ' ')}</span>
                        <span className="font-mono text-amber-800 font-bold">{cf.value} ({cf.rule})</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">No heuristic risk thresholds breached in supplied inputs.</p>
                )}
              </div>

              {/* Support Suggestions */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-800">Support Recommendations:</span>
                <ul className="space-y-1 text-xs text-slate-600">
                  {predictionResult.interventions.map((sug, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                      <span>{sug}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-2 text-[10px] text-slate-400 border-t border-slate-100">
                {predictionResult.model_note} · {predictionResult.factor_method}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-center text-xs text-slate-400">
              <Sparkles className="w-8 h-8 text-slate-300 mb-2" />
              <span>Adjust parameters on the left and click "Generate Academic Risk Inference" to evaluate.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
