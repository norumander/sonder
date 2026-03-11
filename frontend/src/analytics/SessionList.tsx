/**
 * Session list page showing all past sessions for the tutor.
 * Sorted by date, paginated, clicking navigates to detail view.
 */

import type { SessionListItem } from "./types";
import { PAGE_SIZE } from "./useSessionList";

interface SessionListProps {
  sessions: SessionListItem[];
  total: number;
  loading: boolean;
  error: string | null;
  page: number;
  onPageChange: (page: number) => void;
  onSelectSession: (sessionId: string) => void;
}

function formatDate(isoString: string | null): string {
  if (!isoString) return "--";
  const d = new Date(isoString);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start || !end) return "--";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "<1 min";
  return `${mins} min`;
}

const STATUS_BADGE: Record<string, string> = {
  completed: "bg-slate-800 text-slate-300 border border-slate-700",
  active: "bg-emerald-900/50 text-emerald-400 border border-emerald-500/30",
  waiting: "bg-amber-900/50 text-amber-400 border border-amber-500/30",
};

export function SessionList({
  sessions,
  total,
  loading,
  error,
  page,
  onPageChange,
  onSelectSession,
}: SessionListProps) {
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (loading) {
    return (
      <div className="flex justify-center p-12 text-gray-400" data-testid="session-list-loading">
        Loading sessions...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-600" data-testid="session-list-error">
        {error}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="p-12 text-center text-gray-400" data-testid="session-list-empty">
        No sessions yet. Create your first session to get started.
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden" data-testid="session-list">
      <table className="w-full text-left text-sm text-slate-300">
        <thead className="bg-slate-900/80 backdrop-blur-md">
          <tr className="border-b border-slate-700/50 text-xs uppercase tracking-wider text-slate-400">
            <th className="px-6 py-4 font-semibold">Date</th>
            <th className="px-6 py-4 font-semibold">Student</th>
            <th className="px-6 py-4 font-semibold">Subject</th>
            <th className="px-6 py-4 font-semibold">Duration</th>
            <th className="px-6 py-4 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr
              key={s.id}
              className="cursor-pointer border-b border-slate-700/30 hover:bg-slate-800/50 transition-colors"
              onClick={() => onSelectSession(s.id)}
              data-testid={`session-row-${s.id}`}
            >
              <td className="px-6 py-4 font-medium text-white">{formatDate(s.start_time)}</td>
              <td className="px-6 py-4">{s.student_display_name ?? "--"}</td>
              <td className="px-6 py-4">{s.subject ?? "--"}</td>
              <td className="px-6 py-4">{formatDuration(s.start_time, s.end_time)}</td>
              <td className="px-6 py-4">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[s.status] ?? ""}`}>
                  {s.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-700/50 bg-slate-900/30 px-6 py-4" data-testid="pagination">
          <span className="text-sm text-slate-400">
            {total} session{total !== 1 ? "s" : ""} total
          </span>
          <div className="flex gap-2">
            <button
              className="rounded-md border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              disabled={page === 0}
              onClick={() => onPageChange(page - 1)}
              data-testid="prev-page"
            >
              Previous
            </button>
            <span className="px-3 py-2 text-sm text-slate-400 font-medium">
              Page {page + 1} of {totalPages}
            </span>
            <button
              className="rounded-md border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              disabled={page >= totalPages - 1}
              onClick={() => onPageChange(page + 1)}
              data-testid="next-page"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
