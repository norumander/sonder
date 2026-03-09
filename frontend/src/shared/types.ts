/**
 * Shared type definitions for WebSocket messages and metrics.
 */

/** Server metrics snapshot broadcast to the tutor via WebSocket. */
export interface ServerMetrics {
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
  timestamp_ms: number;
}

/** WebSocket message types received by the tutor. */
export interface ServerMetricsMessage {
  type: "server_metrics";
  data: ServerMetrics;
}

export interface AttentionDriftMessage {
  type: "attention_drift";
  data: {
    role: "tutor" | "student";
    drifting: boolean;
    reason: string;
    timestamp_ms: number;
  };
}

export interface StudentStatusMessage {
  type: "student_status";
  data: {
    connected: boolean;
  };
}

export interface NudgeData {
  nudge_type: string;
  message: string;
  priority: "high" | "medium" | "low";
}

export interface NudgeMessage {
  type: "nudge";
  data: NudgeData;
  timestamp: number;
}

export interface HeartbeatMessage {
  type: "heartbeat";
}

export type ServerMessage =
  | ServerMetricsMessage
  | AttentionDriftMessage
  | StudentStatusMessage
  | NudgeMessage
  | HeartbeatMessage;

/** Trend direction for a metric over the last 2 minutes. */
export type TrendDirection = "improving" | "declining" | "stable";

/** Color-coded status for metric health. */
export type MetricStatus = "green" | "yellow" | "red";

/** Nudge type identifiers matching backend NudgeType enum. */
export type NudgeType =
  | "student_silent"
  | "student_low_eye_contact"
  | "tutor_dominant"
  | "student_energy_drop"
  | "interruption_spike"
  | "tutor_low_eye_contact";

/** Configurable nudge trigger thresholds. */
export interface NudgeThresholds {
  student_silent_minutes: number;
  eye_contact_low: number;
  eye_contact_duration_s: number;
  tutor_talk_pct: number;
  tutor_talk_duration_minutes: number;
  energy_drop_pct: number;
  interruption_count: number;
  interruption_window_minutes: number;
}

/** Tutor nudge preferences (matches backend PreferencesBody). */
export interface TutorPreferences {
  enabled_nudges: NudgeType[];
  nudge_thresholds: NudgeThresholds;
}
