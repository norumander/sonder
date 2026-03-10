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
      ? "text-green-700 bg-green-50 border-green-200"
      : score >= 40
        ? "text-yellow-700 bg-yellow-50 border-yellow-200"
        : "text-red-700 bg-red-50 border-red-200";

  return (
    <div
      className={`flex flex-col items-center rounded-xl border-2 px-6 py-3 ${color}`}
      data-testid="engagement-score"
    >
      <span className="text-xs font-medium uppercase tracking-wider opacity-75">
        Engagement Score
      </span>
      <span className="text-3xl font-bold">{Math.round(score)}</span>
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
      <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-600">
        {label}
      </h4>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Eye Contact (avg)</span>
          <span className="font-medium">{Math.round(eyeContact.avg * 100)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Eye Contact (range)</span>
          <span className="text-gray-600">
            {Math.round(eyeContact.min * 100)}% – {Math.round(eyeContact.max * 100)}%
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Energy (avg)</span>
          <span className="font-medium">{Math.round(energy.avg * 100)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Energy (range)</span>
          <span className="text-gray-600">
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
        className="text-sm text-blue-600 hover:underline"
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
        <div className="rounded-lg border bg-white p-4" data-testid="talk-time">
          <h4 className="mb-2 text-sm font-semibold text-gray-600">Talk Time</h4>
          <div className="flex gap-4 text-sm">
            <div>
              <span className="text-gray-500">Tutor: </span>
              <span className="font-medium">{Math.round(summary.talk_time_ratio.tutor_pct)}%</span>
            </div>
            <div>
              <span className="text-gray-500">Student: </span>
              <span className="font-medium">{Math.round(summary.talk_time_ratio.student_pct)}%</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4" data-testid="interruptions">
          <h4 className="mb-2 text-sm font-semibold text-gray-600">Interruptions</h4>
          <div className="flex gap-4 text-sm">
            <div>
              <span className="text-gray-500">Total: </span>
              <span className="font-medium">{summary.total_interruptions}</span>
            </div>
            <div>
              <span className="text-gray-500">Tutor: </span>
              <span>{summary.interruption_attribution.tutor_count}</span>
            </div>
            <div>
              <span className="text-gray-500">Student: </span>
              <span>{summary.interruption_attribution.student_count}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Participant metric summaries */}
      <div className="flex gap-6 rounded-lg border bg-white p-4">
        <MetricSummarySection label="Tutor" metrics={summary.tutor_metrics} />
        <div className="w-px bg-gray-200" />
        <MetricSummarySection label="Student" metrics={summary.student_metrics} />
      </div>

      {/* Recommendations */}
      {summary.recommendations.length > 0 && (
        <div className="rounded-lg border bg-blue-50 p-4" data-testid="recommendations">
          <h4 className="mb-2 text-sm font-semibold text-blue-800">Recommendations</h4>
          <ul className="list-disc pl-5 text-sm text-blue-700">
            {summary.recommendations.map((rec, i) => (
              <li key={i}>{rec}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Timeline chart */}
      <div className="rounded-lg border bg-white p-4">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-600">
          Engagement Timeline
        </h3>
        <TimelineChart snapshots={snapshots} />
      </div>

      {/* Nudge list */}
      {nudges.length > 0 && (
        <div className="rounded-lg border bg-white p-4" data-testid="nudge-list">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-600">
            Nudges Delivered ({nudges.length})
          </h3>
          <div className="space-y-2">
            {nudges.map((n, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded border p-2 text-sm"
                data-testid={`nudge-item-${i}`}
              >
                <span className="whitespace-nowrap font-mono text-xs text-gray-400">
                  {formatTimestamp(n.timestamp_ms)}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${PRIORITY_COLORS[n.priority] ?? ""}`}>
                  {n.priority}
                </span>
                <span className="text-gray-700">{n.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
