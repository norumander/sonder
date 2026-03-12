/**
 * Non-intrusive toast notification for a coaching nudge.
 */

import type { NudgeData } from "../shared/types";

const PRIORITY_STYLES: Record<NudgeData["priority"], string> = {
  high: "border-red-500/50 bg-red-950/40 text-red-100",
  medium: "border-yellow-500/50 bg-yellow-950/40 text-yellow-100",
  low: "border-brand-teal/50 bg-brand-teal/10 text-brand-teal",
};

/** Derive the trigger source from nudge_type for display. */
export function getTriggerSource(nudgeType: string): "Student" | "Tutor" {
  if (nudgeType.startsWith("tutor_")) return "Tutor";
  return "Student";
}

const TRIGGER_STYLES: Record<string, string> = {
  Student: "bg-yellow-500/20 text-yellow-300",
  Tutor: "bg-brand-purple/20 text-brand-purple",
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
  const source = getTriggerSource(nudge.nudge_type);
  return (
    <div
      data-testid="nudge-toast"
      className={`glass-panel flex items-start gap-3 rounded-xl border-l-4 px-4 py-3 shadow-lg shadow-black/20 backdrop-blur-md ${PRIORITY_STYLES[nudge.priority]}`}
    >
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-xs font-bold uppercase tracking-wider opacity-80">
            Coaching Nudge
          </p>
          <span
            data-testid="nudge-source"
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TRIGGER_STYLES[source]}`}
          >
            {source}
          </span>
          {timestampMs != null && (
            <span
              className="text-[10px] font-mono opacity-60"
              data-testid="nudge-timestamp"
            >
              {formatSessionTime(timestampMs)}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm font-medium opacity-90">{nudge.message}</p>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss nudge"
        className="opacity-50 hover:opacity-100 transition-opacity"
      >
        &times;
      </button>
    </div>
  );
}
