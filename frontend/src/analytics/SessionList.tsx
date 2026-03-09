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
  completed: "bg-gray-100 text-gray-700",
  active: "bg-green-100 text-green-700",
  waiting: "bg-yellow-100 text-yellow-700",
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
    <div data-testid="session-list">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b text-xs uppercase tracking-wider text-gray-500">
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Student</th>
            <th className="px-4 py-3">Subject</th>
            <th className="px-4 py-3">Duration</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr
              key={s.id}
              className="cursor-pointer border-b hover:bg-gray-50"
              onClick={() => onSelectSession(s.id)}
              data-testid={`session-row-${s.id}`}
            >
              <td className="px-4 py-3 font-medium">{formatDate(s.start_time)}</td>
              <td className="px-4 py-3">{s.student_display_name ?? "--"}</td>
              <td className="px-4 py-3">{s.subject ?? "--"}</td>
              <td className="px-4 py-3">{formatDuration(s.start_time, s.end_time)}</td>
              <td className="px-4 py-3">
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
        <div className="flex items-center justify-between border-t px-4 py-3" data-testid="pagination">
          <span className="text-sm text-gray-500">
            {total} session{total !== 1 ? "s" : ""} total
          </span>
          <div className="flex gap-2">
            <button
              className="rounded border px-3 py-1 text-sm disabled:opacity-50"
              disabled={page === 0}
              onClick={() => onPageChange(page - 1)}
              data-testid="prev-page"
            >
              Previous
            </button>
            <span className="px-2 py-1 text-sm text-gray-600">
              Page {page + 1} of {totalPages}
            </span>
            <button
              className="rounded border px-3 py-1 text-sm disabled:opacity-50"
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
