/**
 * Non-intrusive toast notification for a coaching nudge.
 */

import type { NudgeData } from "../shared/types";

const PRIORITY_STYLES: Record<NudgeData["priority"], string> = {
  high: "border-red-400 bg-red-50",
  medium: "border-yellow-400 bg-yellow-50",
  low: "border-blue-400 bg-blue-50",
};

/** Format session-relative milliseconds as hh:mm:ss. */
export function formatSessionTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface NudgeToastProps {
  nudge: NudgeData;
  timestampMs?: number | null;
  onDismiss: () => void;
}

export function NudgeToast({ nudge, timestampMs, onDismiss }: NudgeToastProps) {
  return (
    <div
      data-testid="nudge-toast"
      className={`flex items-start gap-3 rounded-lg border-l-4 px-4 py-3 shadow-md ${PRIORITY_STYLES[nudge.priority]}`}
    >
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Coaching Nudge
          </p>
          {timestampMs != null && (
            <span
              className="text-[10px] font-mono text-gray-400"
              data-testid="nudge-timestamp"
            >
              {formatSessionTime(timestampMs)}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm font-medium text-gray-800">{nudge.message}</p>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss nudge"
        className="text-gray-400 hover:text-gray-600"
      >
        &times;
      </button>
    </div>
  );
}
