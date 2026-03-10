/**
 * Types for the post-session analytics dashboard.
 */

/** A session item as returned by GET /sessions list endpoint. */
export interface SessionListItem {
  id: string;
  join_code: string;
  status: "waiting" | "active" | "completed";
  subject: string | null;
  student_display_name: string | null;
  start_time: string | null;
  end_time: string | null;
}

/** Aggregated metric stats (avg/min/max). */
export interface MetricAggregate {
  avg: number;
  min: number;
  max: number;
}

/** Participant metric aggregates from session summary. */
export interface ParticipantSummaryMetrics {
  eye_contact: MetricAggregate;
  energy: MetricAggregate;
}

/** Flagged moment from session summary. */
export interface FlaggedMoment {
  source: "nudge" | "drift";
  type: string;
  message: string;
  priority: "high" | "medium" | "low";
  timestamp_ms: number;
}

/** Full session summary as returned by GET /sessions/{id}/summary. */
export interface SessionSummaryData {
  tutor_metrics: ParticipantSummaryMetrics;
  student_metrics: ParticipantSummaryMetrics;
  talk_time_ratio: { tutor_pct: number; student_pct: number };
  total_interruptions: number;
  interruption_attribution: { tutor_count: number; student_count: number };
  flagged_moments: FlaggedMoment[];
  recommendations: string[];
  overall_engagement_score: number;
}

/** A single metric snapshot from the time series. */
export interface MetricSnapshotData {
  timestamp_ms: number;
  metrics: {
    tutor_eye_contact: number | null;
    student_eye_contact: number | null;
    tutor_talk_pct: number;
    student_talk_pct: number;
    interruption_count: number;
    tutor_energy: number | null;
    student_energy: number | null;
    tutor_attention_drift: boolean;
    student_attention_drift: boolean;
    drift_reason: string | null;
  };
}

/** A nudge delivered during a session. */
export interface SessionNudge {
  timestamp_ms: number;
  nudge_type: string;
  message: string;
  priority: "high" | "medium" | "low";
}

/** A single data point in the cross-session trends response. */
export interface TrendDataPoint {
  session_id: string;
  start_time: string | null;
  end_time: string | null;
  tutor_eye_contact: number | null;
  student_eye_contact: number | null;
  tutor_energy: number | null;
  student_energy: number | null;
  tutor_talk_pct: number | null;
  student_talk_pct: number | null;
  total_interruptions: number;
  engagement_score: number;
}

/** Response from GET /tutor/trends. */
export interface TrendsResponse {
  sessions: TrendDataPoint[];
}
