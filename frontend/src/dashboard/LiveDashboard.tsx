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
    <div className="space-y-2 mb-3">
      {banners.map((b) => (
        <div
          key={b.testId}
          data-testid={b.testId}
          className="rounded-lg bg-yellow-500/10 px-3 py-2 text-xs font-medium text-yellow-200 border border-yellow-500/20 backdrop-blur-sm shadow-sm"
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
    <div className="flex-1 glass-panel p-4 rounded-xl shadow-lg shadow-black/20 border-slate-700/50" data-testid={`section-${label.toLowerCase()}`}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
          {label}
        </h3>
        {connected !== undefined && (
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full shadow-sm ${connected ? "bg-brand-teal shadow-brand-teal/50" : "bg-slate-600"}`}
            title={connected ? "Connected" : "Disconnected"}
          />
        )}
      </div>
      <DegradationBanner role={role} warnings={warnings} connected={connected} />
      <div className="grid grid-cols-2 gap-3">
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
    score >= 70 ? "text-brand-teal border-brand-teal/30 bg-brand-teal/5 shadow-[inset_0_0_20px_rgba(45,212,191,0.1)]"
    : score >= 40 ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/5 shadow-[inset_0_0_20px_rgba(250,204,21,0.1)]"
    : "text-brand-red border-brand-red/30 bg-brand-red/5 shadow-[inset_0_0_20px_rgba(244,63,94,0.1)]";

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border px-8 py-4 backdrop-blur-md ${color} transition-all`}
      data-testid="engagement-score"
    >
      <span className="text-xs font-bold uppercase tracking-widest opacity-80 mb-1">
        Engagement
      </span>
      <span className="text-4xl font-black drop-shadow-md">{score}</span>
    </div>
  );
}

function LatencyIndicator({ latencyMs }: { latencyMs: number | null }) {
  if (latencyMs === null) return null;

  const color =
    latencyMs < 100
      ? "text-green-600"
      : latencyMs < 300
        ? "text-yellow-600"
        : "text-red-600";

  return (
    <span
      className={`text-xs font-mono ${color}`}
      data-testid="pipeline-latency"
      title="Pipeline latency (server → client)"
    >
      {latencyMs}ms
    </span>
  );
}

export function LiveDashboard({ state }: LiveDashboardProps) {
  const { metrics, studentConnected, trends, engagementScore, degradationWarnings, pipelineLatency } =
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
      {/* Engagement score + latency */}
      <div className="flex items-center justify-center gap-4">
        <EngagementBadge score={engagementScore} />
        <div className="flex flex-col items-center gap-1">
          <LatencyIndicator latencyMs={pipelineLatency} />
          {metrics.response_latency_ms != null && (
            <span
              className="text-xs font-mono text-gray-500"
              data-testid="response-latency"
              title="Avg response latency between speakers"
            >
              resp: {Math.round(metrics.response_latency_ms)}ms
            </span>
          )}
        </div>
      </div>

      {/* Shared metrics */}
      <div className="flex justify-center gap-2">
        <MetricCard
          label="Interruptions"
          value={formatMetricValue("interruptions", metrics.interruption_count)}
          status={getMetricStatus("interruptions", metrics.interruption_count)}
        />
        {metrics.response_latency_ms != null && (
          <MetricCard
            label="Response Time"
            value={`${(metrics.response_latency_ms / 1000).toFixed(1)}s`}
            status={
              metrics.response_latency_ms < 2000
                ? "green"
                : metrics.response_latency_ms < 5000
                  ? "yellow"
                  : "red"
            }
          />
        )}
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
