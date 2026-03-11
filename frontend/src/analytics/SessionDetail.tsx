/**
 * Session detail view showing full summary, timeline chart, and nudge list.
 */

import type { MetricSnapshotData, SessionNudge, SessionSummaryData } from "./types";
import { TimelineChart } from "./TimelineChart";

interface SessionDetailProps {
  summary: SessionSummaryData | null;
  snapshots: MetricSnapshotData[];
  nudges: SessionNudge[];
  loading: boolean;
  error: string | null;
  onBack: () => void;
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70
      ? "text-brand-teal bg-brand-teal/10 border-brand-teal/30"
      : score >= 40
        ? "text-amber-400 bg-amber-400/10 border-amber-400/30"
        : "text-brand-pink bg-brand-pink/10 border-brand-pink/30";

  return (
    <div
      className={`flex flex-col items-center rounded-xl border-2 px-6 py-3 ${color}`}
      data-testid="engagement-score"
    >
      <span className="text-sm font-semibold uppercase tracking-widest opacity-80 mb-1">
        Engagement Score
      </span>
      <span className="text-4xl font-extrabold">{Math.round(score)}</span>
    </div>
  );
}

interface MetricAggregate {
  avg: number;
  min: number;
  max: number;
}

const EMPTY_AGGREGATE: MetricAggregate = { avg: 0, min: 0, max: 0 };

function MetricSummarySection({
  label,
  metrics,
}: {
  label: string;
  metrics: { eye_contact?: MetricAggregate; energy?: MetricAggregate } | Record<string, never>;
}) {
  const eyeContact = metrics.eye_contact ?? EMPTY_AGGREGATE;
  const energy = metrics.energy ?? EMPTY_AGGREGATE;
  const hasData = !!metrics.eye_contact || !!metrics.energy;

  if (!hasData) {
    return (
      <div className="flex-1" data-testid={`summary-${label.toLowerCase()}`}>
        <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-600">
          {label}
        </h4>
        <p className="text-sm text-gray-400">No metric data available</p>
      </div>
    );
  }

  return (
    <div className="flex-1" data-testid={`summary-${label.toLowerCase()}`}>
      <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </h4>
      <div className="space-y-2 text-sm text-slate-300">
        <div className="flex justify-between items-center bg-slate-800/50 p-2 rounded">
          <span className="text-slate-400">Eye Contact (avg)</span>
          <span className="font-semibold text-white">{Math.round(eyeContact.avg * 100)}%</span>
        </div>
        <div className="flex justify-between items-center bg-slate-800/50 p-2 rounded">
          <span className="text-slate-400">Eye Contact (range)</span>
          <span className="text-slate-300">
            {Math.round(eyeContact.min * 100)}% – {Math.round(eyeContact.max * 100)}%
          </span>
        </div>
        <div className="flex justify-between items-center bg-slate-800/50 p-2 rounded">
          <span className="text-slate-400">Energy (avg)</span>
          <span className="font-semibold text-white">{Math.round(energy.avg * 100)}%</span>
        </div>
        <div className="flex justify-between items-center bg-slate-800/50 p-2 rounded">
          <span className="text-slate-400">Energy (range)</span>
          <span className="text-slate-300">
            {Math.round(energy.min * 100)}% – {Math.round(energy.max * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-gray-100 text-gray-600",
};

export function SessionDetail({
  summary,
  snapshots,
  nudges,
  loading,
  error,
  onBack,
}: SessionDetailProps) {
  if (loading) {
    return (
      <div className="flex justify-center p-12 text-gray-400" data-testid="detail-loading">
        Loading session details...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-600" data-testid="detail-error">
        {error}
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  return (
    <div className="space-y-6" data-testid="session-detail">
      {/* Back button */}
      <button
        onClick={onBack}
        className="text-sm text-brand-teal hover:underline flex items-center gap-1 font-medium"
        data-testid="back-button"
      >
        &larr; Back to sessions
      </button>

      {/* Engagement score */}
      <div className="flex justify-center">
        <ScoreBadge score={summary.overall_engagement_score} />
      </div>

      {/* Talk time & interruptions */}
      <div className="grid grid-cols-2 gap-4">
        <div className="glass-panel p-6" data-testid="talk-time">
          <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-400">Talk Time</h4>
          <div className="flex gap-6 text-base">
            <div className="flex flex-col">
              <span className="text-slate-500 text-sm mb-1">Tutor</span>
              <span className="font-bold text-white text-xl">{Math.round(summary.talk_time_ratio.tutor_pct)}%</span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500 text-sm mb-1">Student</span>
              <span className="font-bold text-brand-purple text-xl">{Math.round(summary.talk_time_ratio.student_pct)}%</span>
            </div>
          </div>
        </div>

        <div className="glass-panel p-6" data-testid="interruptions">
          <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-400">Interruptions</h4>
          <div className="flex gap-6 text-base">
            <div className="flex flex-col">
              <span className="text-slate-500 text-sm mb-1">Total</span>
              <span className="font-bold text-white text-xl">{summary.total_interruptions}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500 text-sm mb-1">Tutor</span>
              <span className="font-bold text-slate-300 text-xl">{summary.interruption_attribution.tutor_count}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500 text-sm mb-1">Student</span>
              <span className="font-bold text-brand-pink text-xl">{summary.interruption_attribution.student_count}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Participant metric summaries */}
      <div className="flex gap-8 glass-panel p-6">
        <MetricSummarySection label="Tutor" metrics={summary.tutor_metrics} />
        <div className="w-px bg-slate-700/50" />
        <MetricSummarySection label="Student" metrics={summary.student_metrics} />
      </div>

      {/* Recommendations */}
      {summary.recommendations.length > 0 && (
        <div className="glass-panel border-brand-teal/30 bg-brand-teal/5 p-5" data-testid="recommendations">
          <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-brand-teal">AI Recommendations</h4>
          <ul className="list-disc pl-5 text-sm text-slate-300 space-y-1">
            {summary.recommendations.map((rec, i) => (
              <li key={i}>{rec}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Timeline chart */}
      <div className="glass-panel p-6">
        <h3 className="mb-6 text-sm font-bold uppercase tracking-wider text-slate-400">
          Engagement Timeline
        </h3>
        <TimelineChart snapshots={snapshots} />
      </div>

      {/* Nudge list */}
      {nudges.length > 0 && (
        <div className="glass-panel p-6" data-testid="nudge-list">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-400">
            Nudges Delivered ({nudges.length})
          </h3>
          <div className="space-y-3">
            {nudges.map((n, i) => (
              <div
                key={i}
                className="flex items-start gap-4 rounded-lg bg-slate-800/50 border border-slate-700/50 p-3 text-sm transition-colors hover:bg-slate-800"
                data-testid={`nudge-item-${i}`}
              >
                <span className="whitespace-nowrap font-mono text-xs text-slate-500 mt-0.5">
                  {formatTimestamp(n.timestamp_ms)}
                </span>
                <span className={`rounded-sm px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${PRIORITY_COLORS[n.priority] ?? ""}`}>
                  {n.priority}
                </span>
                <span className="text-slate-300 font-medium">{n.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
