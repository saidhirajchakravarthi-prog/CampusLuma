import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { Header } from '../components/layout/Header';
import { TableSkeleton } from '../components/ui/LoadingSkeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { Alert } from '../components/ui/Alert';
import { StatusBadge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import {
  ClipboardList,
  PlusCircle,
  Filter,
  Edit,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { Intervention } from '../api/types';

const EMPTY_INTERVENTIONS: Intervention[] = [];

export function InterventionsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Create Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [studentIdInput, setStudentIdInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [ownerInput, setOwnerInput] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Edit/Update Status Modal
  const [selectedIntervention, setSelectedIntervention] = useState<Intervention | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string>('Open');
  const [updateOwner, setUpdateOwner] = useState<string>('');
  const [updateDate, setUpdateDate] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Fetch all interventions
  const {
    data: interventionsList,
    loading,
    error,
    refetch,
  } = useApi(() => api.getInterventions(), []);

  const items = interventionsList ?? EMPTY_INTERVENTIONS;
  const {
    data: interventionHistory,
    loading: historyLoading,
    error: historyError,
    refetch: refetchHistory,
  } = useApi(
    () => selectedIntervention ? api.getInterventionHistory(selectedIntervention.id) : Promise.resolve([]),
    [selectedIntervention?.id]
  );

  // Filtered list
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        const matchesId = item.student_id.toLowerCase().includes(query);
        const matchesDesc = item.description.toLowerCase().includes(query);
        const matchesOwner = (item.owner || '').toLowerCase().includes(query);
        if (!matchesId && !matchesDesc && !matchesOwner) return false;
      }
      return true;
    });
  }, [items, statusFilter, searchTerm]);

  // Overdue / upcoming computation
  const [todayStr] = useState(() => new Date().toISOString().split('T')[0]);
  const overdueCount = useMemo(() => {
    return items.filter(
      (item) => item.status !== 'Completed' && item.status !== 'Cancelled' && item.follow_up_date && item.follow_up_date < todayStr
    ).length;
  }, [items, todayStr]);

  const upcomingCount = useMemo(() => {
    return items.filter(
      (item) => item.status !== 'Completed' && item.status !== 'Cancelled' && item.follow_up_date && item.follow_up_date >= todayStr
    ).length;
  }, [items, todayStr]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentIdInput.trim() || !descriptionInput.trim()) return;
    setIsCreating(true);
    setNotification(null);
    try {
      await api.createIntervention({
        student_id: studentIdInput.trim(),
        description: descriptionInput.trim(),
        owner: ownerInput.trim() || null,
        follow_up_date: dateInput || null,
      });
      setIsCreateOpen(false);
      setStudentIdInput('');
      setDescriptionInput('');
      setOwnerInput('');
      setDateInput('');
      setNotification({ type: 'success', message: 'Intervention successfully logged.' });
      refetch();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to create intervention.' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenEdit = (item: Intervention) => {
    setSelectedIntervention(item);
    setUpdateStatus(item.status);
    setUpdateOwner(item.owner || '');
    setUpdateDate(item.follow_up_date || '');
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIntervention) return;
    setIsUpdating(true);
    setNotification(null);
    try {
      await api.updateIntervention(selectedIntervention.id, {
        status: updateStatus,
        owner: updateOwner.trim() || null,
        follow_up_date: updateDate || null,
      });
      refetchHistory();
      setSelectedIntervention(null);
      setNotification({ type: 'success', message: 'Intervention record updated.' });
      refetch();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to update intervention.' });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Header
        title="Interventions & Support Follow-Up"
        subtitle="Track proactive faculty actions, assigned counselors, due dates, and student follow-up statuses"
        actions={
          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-2xs cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Log New Intervention</span>
          </button>
        }
      />

      {notification && (
        <Alert type={notification.type} title={notification.type === 'success' ? 'Confirmed' : 'Error'}>
          {notification.message}
        </Alert>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Interventions</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{items.length}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">Pending Actions</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">
            {items.filter((i) => i.status === 'Open' || i.status === 'In Progress').length}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-600">Overdue Follow-Ups</p>
          <p className="text-2xl font-bold text-rose-600 mt-1">{overdueCount}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Upcoming Follow-Ups</p>
          <p className="text-2xl font-bold text-indigo-600 mt-1">{upcomingCount}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Completed Actions</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            {items.filter((i) => i.status === 'Completed').length}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="">All Statuses</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>

        <input
          type="text"
          placeholder="Filter by Student ID, owner, or action description..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full sm:w-80 py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      {error && (
        <Alert type="error" title="Failed to load interventions">
          {error}
        </Alert>
      )}

      {/* Interventions Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No matching interventions found"
            description="Use 'Log New Intervention' to schedule follow-ups or connect with students."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Student ID</th>
                  <th className="py-3 px-4">Action Description</th>
                  <th className="py-3 px-4">Assigned Owner</th>
                  <th className="py-3 px-4">Follow-Up Date</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => {
                  const isOverdue =
                    item.status !== 'Completed' &&
                    item.status !== 'Cancelled' &&
                    item.follow_up_date &&
                    item.follow_up_date < todayStr;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-slate-900">
                        <Link
                          to={`/students/${item.student_id}`}
                          className="hover:text-indigo-600 transition-colors inline-flex items-center gap-1"
                        >
                          <span>{item.student_id}</span>
                          <ExternalLink className="w-3 h-3 text-slate-400" />
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-slate-800 font-medium max-w-md">
                        {item.description}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {item.owner || <span className="text-slate-300 italic">Unassigned</span>}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {item.follow_up_date ? (
                          <span
                            className={
                              isOverdue
                                ? 'text-rose-600 font-bold flex items-center gap-1'
                                : 'text-slate-700'
                            }
                          >
                            {isOverdue && <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                            {item.follow_up_date}
                          </span>
                        ) : (
                          <span className="text-slate-300 italic">None</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                        {item.created_at}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 transition-colors cursor-pointer"
                        >
                          <Edit className="w-3 h-3" />
                          <span>Update</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Dialog
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Log New Student Support Intervention"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Target Student ID <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g., DEMO-1001"
              value={studentIdInput}
              onChange={(e) => setStudentIdInput(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 font-mono focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Action Description <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              placeholder="Specify the support or remediation intervention..."
              value={descriptionInput}
              onChange={(e) => setDescriptionInput(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Assigned Owner / Faculty
              </label>
              <input
                type="text"
                placeholder="e.g., Academic Counselor"
                value={ownerInput}
                onChange={(e) => setOwnerInput(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Target Follow-Up Date
              </label>
              <input
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {isCreating ? 'Saving...' : 'Save Intervention'}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Edit Status Modal */}
      <Dialog
        open={!!selectedIntervention}
        onClose={() => setSelectedIntervention(null)}
        title={`Update Intervention #${selectedIntervention?.id}`}
      >
        <form onSubmit={handleUpdate} className="space-y-4">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs">
            <p className="font-semibold text-slate-800">{selectedIntervention?.description}</p>
            <p className="text-[11px] text-slate-500 mt-1 font-mono">
              Student ID: {selectedIntervention?.student_id}
            </p>
          </div>

          <section aria-label="Intervention change history" className="rounded-lg border border-slate-200 p-3">
            <h3 className="text-xs font-semibold text-slate-800">Change history</h3>
            {historyLoading ? (
              <p className="text-xs text-slate-500 mt-2">Loading history…</p>
            ) : historyError ? (
              <p className="text-xs text-rose-600 mt-2">Could not load history: {historyError}</p>
            ) : interventionHistory?.length ? (
              <ol className="mt-2 space-y-2">
                {interventionHistory.map((entry) => (
                  <li key={entry.id} className="text-xs text-slate-600">
                    <span className="font-medium capitalize">{entry.action}</span> · {entry.status}
                    {entry.owner ? ` · ${entry.owner}` : ''}
                    {entry.follow_up_date ? ` · Follow-up ${entry.follow_up_date}` : ''}
                    {entry.actor ? ` · by ${entry.actor}` : ''}
                    <span className="block text-[10px] text-slate-400">{entry.changed_at}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-slate-500 mt-2">No changes recorded.</p>
            )}
          </section>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
            <select
              value={updateStatus}
              onChange={(e) => setUpdateStatus(e.target.value)}
              className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900"
            >
              <option value="Open">Open</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Owner</label>
              <input
                type="text"
                value={updateOwner}
                onChange={(e) => setUpdateOwner(e.target.value)}
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Follow-Up Date</label>
              <input
                type="date"
                value={updateDate}
                onChange={(e) => setUpdateDate(e.target.value)}
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setSelectedIntervention(null)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUpdating}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {isUpdating ? 'Updating...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
