/**
 * Hook that consumes server_metrics WebSocket messages and maintains
 * current state, 2-minute history for trends, and engagement score.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { DegradationWarningType, ServerMetrics, TrendDirection } from "../shared/types";
import { computeEngagementScore, computeTrend } from "./metricUtils";

/** Maximum number of history samples to keep (~2 min at 2Hz). */
const MAX_HISTORY = 240;

type MetricTrends = {
  tutor_eye_contact: TrendDirection;
  student_eye_contact: TrendDirection;
  tutor_energy: TrendDirection;
  student_energy: TrendDirection;
  tutor_talk_pct: TrendDirection;
  student_talk_pct: TrendDirection;
};

const DEFAULT_TRENDS: MetricTrends = {
  tutor_eye_contact: "stable",
  student_eye_contact: "stable",
  tutor_energy: "stable",
  student_energy: "stable",
  tutor_talk_pct: "stable",
  student_talk_pct: "stable",
};

/** Active degradation warnings keyed by "{role}:{warning_type}". */
export type DegradationWarnings = Record<string, boolean>;

export interface ServerMetricsState {
  /** Current metrics snapshot, or null if no data received yet. */
  metrics: ServerMetrics | null;
  /** Whether the student is currently connected. */
  studentConnected: boolean;
  /** Trend direction per trackable metric. */
  trends: MetricTrends;
  /** Combined engagement score (0-100). */
  engagementScore: number;
  /** Number of history samples stored (for testing). */
  historyLength: number;
  /** Active degradation warnings (face not detected, audio unavailable). */
  degradationWarnings: DegradationWarnings;
}

/** Build a degradation warning key for lookups. */
export function degradationKey(
  role: string,
  warningType: DegradationWarningType,
): string {
  return `${role}:${warningType}`;
}

export function useServerMetrics(ws: WebSocket | null): ServerMetricsState {
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [studentConnected, setStudentConnected] = useState(false);
  const [trends, setTrends] = useState<MetricTrends>(DEFAULT_TRENDS);
  const [engagementScore, setEngagementScore] = useState(0);
  const [degradationWarnings, setDegradationWarnings] =
    useState<DegradationWarnings>({});
  const historyRef = useRef<ServerMetrics[]>([]);

  const handleMessage = useCallback((event: MessageEvent) => {
    let msg: { type: string; data?: unknown };
    try {
      msg = JSON.parse(event.data as string);
    } catch {
      return;
    }

    if (msg.type === "server_metrics") {
      const data = msg.data as ServerMetrics;
      setMetrics(data);

      // Append to history, cap at MAX_HISTORY
      const history = historyRef.current;
      history.push(data);
      if (history.length > MAX_HISTORY) {
        history.splice(0, history.length - MAX_HISTORY);
      }

      // Compute trends from history
      setTrends({
        tutor_eye_contact: computeTrend(history.map((h) => h.tutor_eye_contact)),
        student_eye_contact: computeTrend(history.map((h) => h.student_eye_contact)),
        tutor_energy: computeTrend(history.map((h) => h.tutor_energy)),
        student_energy: computeTrend(history.map((h) => h.student_energy)),
        tutor_talk_pct: computeTrend(history.map((h) => h.tutor_talk_pct)),
        student_talk_pct: computeTrend(history.map((h) => h.student_talk_pct)),
      });

      setEngagementScore(computeEngagementScore(data));
    } else if (msg.type === "student_status") {
      const data = msg.data as { connected: boolean };
      setStudentConnected(data.connected);
    } else if (msg.type === "degradation_warning") {
      const data = msg.data as {
        role: string;
        warning_type: DegradationWarningType;
        active: boolean;
      };
      const key = degradationKey(data.role, data.warning_type);
      setDegradationWarnings((prev) => ({ ...prev, [key]: data.active }));
    }
    // heartbeat and other messages are ignored
  }, []);

  useEffect(() => {
    if (!ws) return;

    ws.addEventListener("message", handleMessage);
    return () => {
      ws.removeEventListener("message", handleMessage);
    };
  }, [ws, handleMessage]);

  return {
    metrics,
    studentConnected,
    trends,
    engagementScore,
    historyLength: historyRef.current.length,
    degradationWarnings,
  };
}
