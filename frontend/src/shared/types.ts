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

export interface HeartbeatMessage {
  type: "heartbeat";
}

export type ServerMessage =
  | ServerMetricsMessage
  | AttentionDriftMessage
  | StudentStatusMessage
  | HeartbeatMessage;

/** Trend direction for a metric over the last 2 minutes. */
export type TrendDirection = "improving" | "declining" | "stable";

/** Color-coded status for metric health. */
export type MetricStatus = "green" | "yellow" | "red";
