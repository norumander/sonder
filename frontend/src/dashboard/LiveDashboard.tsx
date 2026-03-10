/**
 * Live metrics dashboard shown to the tutor during an active session.
 *
 * Displays side-by-side tutor and student metric sections with
 * color-coded status, trend arrows, and a combined engagement score.
 */

import type { ServerMetrics, TrendDirection } from "../shared/types";
import { MetricCard } from "./MetricCard";
import {
  formatMetricValue,
  getMetricStatus,
} from "./metricUtils";
import type { DegradationWarnings, ServerMetricsState } from "./useServerMetrics";
import { degradationKey } from "./useServerMetrics";

interface LiveDashboardProps {
  state: ServerMetricsState;
}

interface ParticipantMetrics {
  eye_contact: number | null;
  talk_pct: number;
  energy: number | null;
  attention_drift: boolean;
}

function extractParticipant(
  metrics: ServerMetrics,
  role: "tutor" | "student",
): ParticipantMetrics {
  return {
    eye_contact: role === "tutor" ? metrics.tutor_eye_contact : metrics.student_eye_contact,
    talk_pct: role === "tutor" ? metrics.tutor_talk_pct : metrics.student_talk_pct,
    energy: role === "tutor" ? metrics.tutor_energy : metrics.student_energy,
    attention_drift:
      role === "tutor" ? metrics.tutor_attention_drift : metrics.student_attention_drift,
  };
}

function DegradationBanner({
  role,
  warnings,
  connected,
}: {
  role: "tutor" | "student";
  warnings: DegradationWarnings;
  connected?: boolean;
}) {
  const banners: { message: string; testId: string }[] = [];

  if (connected === false) {
    banners.push({
      message: `${role === "tutor" ? "Tutor" : "Student"} disconnected`,
      testId: `warning-${role}-disconnected`,
    });
  }

  const faceKey = degradationKey(role, "face_not_detected");
  if (warnings[faceKey]) {
    banners.push({
      message: `${role === "tutor" ? "Tutor" : "Student"} face not detected`,
      testId: `warning-${role}-face`,
    });
  }

  const audioKey = degradationKey(role, "audio_unavailable");
  if (warnings[audioKey]) {
    banners.push({
      message: `${role === "tutor" ? "Tutor" : "Student"} audio unavailable`,
      testId: `warning-${role}-audio`,
    });
  }

  if (banners.length === 0) return null;

  return (
    <div className="space-y-1">
      {banners.map((b) => (
        <div
          key={b.testId}
          data-testid={b.testId}
          className="rounded bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 border border-amber-200"
        >
          {b.message}
        </div>
      ))}
    </div>
  );
}

function ParticipantSection({
  label,
  participant,
  trends,
  connected,
  role,
  warnings,
}: {
  label: string;
  participant: ParticipantMetrics;
  trends: {
    eye_contact: TrendDirection;
    energy: TrendDirection;
    talk_pct: TrendDirection;
  };
  connected?: boolean;
  role: "tutor" | "student";
  warnings: DegradationWarnings;
}) {
  return (
    <div className="flex-1" data-testid={`section-${label.toLowerCase()}`}>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-600">
          {label}
        </h3>
        {connected !== undefined && (
          <span
            className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-gray-300"}`}
            title={connected ? "Connected" : "Disconnected"}
          />
        )}
      </div>
      <DegradationBanner role={role} warnings={warnings} connected={connected} />
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          label="Eye Contact"
          value={formatMetricValue("eye_contact", participant.eye_contact)}
          status={getMetricStatus("eye_contact", participant.eye_contact)}
          trend={trends.eye_contact}
        />
        <MetricCard
          label="Talk Time"
          value={formatMetricValue("talk_pct", participant.talk_pct)}
          status={getMetricStatus("talk_pct", participant.talk_pct)}
          trend={trends.talk_pct}
        />
        <MetricCard
          label="Energy"
          value={formatMetricValue("energy", participant.energy)}
          status={getMetricStatus("energy", participant.energy)}
          trend={trends.energy}
        />
        <MetricCard
          label="Attention"
          value={formatMetricValue("attention_drift", participant.attention_drift)}
          status={getMetricStatus("attention_drift", participant.attention_drift)}
        />
      </div>
    </div>
  );
}

function EngagementBadge({ score }: { score: number }) {
  const color =
    score >= 70 ? "text-green-700 bg-green-50 border-green-200"
    : score >= 40 ? "text-yellow-700 bg-yellow-50 border-yellow-200"
    : "text-red-700 bg-red-50 border-red-200";

  return (
    <div
      className={`flex flex-col items-center rounded-xl border-2 px-6 py-3 ${color}`}
      data-testid="engagement-score"
    >
      <span className="text-xs font-medium uppercase tracking-wider opacity-75">
        Engagement
      </span>
      <span className="text-3xl font-bold">{score}</span>
    </div>
  );
}

export function LiveDashboard({ state }: LiveDashboardProps) {
  const { metrics, studentConnected, trends, engagementScore, degradationWarnings } =
    state;

  if (!metrics) {
    return (
      <div
        className="flex items-center justify-center p-8 text-gray-400"
        data-testid="dashboard-waiting"
      >
        Waiting for metrics...
      </div>
    );
  }

  const tutor = extractParticipant(metrics, "tutor");
  const student = extractParticipant(metrics, "student");

  return (
    <div className="space-y-4 p-4" data-testid="live-dashboard">
      {/* Engagement score */}
      <div className="flex justify-center">
        <EngagementBadge score={engagementScore} />
      </div>

      {/* Shared metrics */}
      <div className="flex justify-center">
        <MetricCard
          label="Interruptions"
          value={formatMetricValue("interruptions", metrics.interruption_count)}
          status={getMetricStatus("interruptions", metrics.interruption_count)}
        />
      </div>

      {/* Side-by-side participant sections */}
      <div className="flex gap-4">
        <ParticipantSection
          label="Tutor"
          participant={tutor}
          trends={{
            eye_contact: trends.tutor_eye_contact,
            energy: trends.tutor_energy,
            talk_pct: trends.tutor_talk_pct,
          }}
          role="tutor"
          warnings={degradationWarnings}
        />
        <ParticipantSection
          label="Student"
          participant={student}
          trends={{
            eye_contact: trends.student_eye_contact,
            energy: trends.student_energy,
            talk_pct: trends.student_talk_pct,
          }}
          connected={studentConnected}
          role="student"
          warnings={degradationWarnings}
        />
      </div>
    </div>
  );
}
