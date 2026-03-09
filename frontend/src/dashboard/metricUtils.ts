/**
 * Utility functions for metric status, trends, engagement scoring, and formatting.
 */

import type { MetricStatus, ServerMetrics, TrendDirection } from "../shared/types";

type MetricName = "eye_contact" | "talk_pct" | "energy" | "interruptions" | "attention_drift";

/**
 * Determine color-coded status for a metric value.
 *
 * Thresholds aligned with nudge rules:
 * - eye_contact: green >=0.6, yellow 0.3-0.6, red <0.3
 * - talk_pct: green 40-60%, yellow 25-40% or 60-75%, red <25% or >75%
 * - energy: green >=0.5, yellow 0.3-0.5, red <0.3
 * - interruptions: green 0-3, yellow 4-6, red >6
 * - attention_drift: green=false, red=true
 */
export function getMetricStatus(
  metric: MetricName,
  value: number | boolean | null,
): MetricStatus {
  if (value === null) return "yellow";

  switch (metric) {
    case "eye_contact": {
      const v = value as number;
      if (v >= 0.6) return "green";
      if (v >= 0.3) return "yellow";
      return "red";
    }
    case "talk_pct": {
      const v = value as number;
      if (v >= 40 && v <= 60) return "green";
      if (v >= 25 && v <= 75) return "yellow";
      return "red";
    }
    case "energy": {
      const v = value as number;
      if (v >= 0.5) return "green";
      if (v >= 0.3) return "yellow";
      return "red";
    }
    case "interruptions": {
      const v = value as number;
      if (v <= 3) return "green";
      if (v <= 6) return "yellow";
      return "red";
    }
    case "attention_drift":
      return value ? "red" : "green";
  }
}

/**
 * Compute trend direction from a time series of values.
 *
 * Compares the average of the first half to the average of the second half.
 * Requires at least 4 non-null samples to determine a trend.
 */
export function computeTrend(values: (number | null)[]): TrendDirection {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 4) return "stable";

  const mid = Math.floor(nums.length / 2);
  const firstHalf = nums.slice(0, mid);
  const secondHalf = nums.slice(mid);

  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  const diff = avgSecond - avgFirst;
  const threshold = 0.05;

  if (diff > threshold) return "improving";
  if (diff < -threshold) return "declining";
  return "stable";
}

/**
 * Compute a combined engagement score (0-100) from current metrics.
 *
 * Weighted components:
 * - Eye contact average: 25%
 * - Talk time balance: 25%
 * - Energy average: 25%
 * - Interruption penalty: 15%
 * - Attention drift penalty: 10%
 */
export function computeEngagementScore(metrics: ServerMetrics): number {
  // Eye contact (0-1) → 0-25 points
  const eyeValues = [metrics.tutor_eye_contact, metrics.student_eye_contact].filter(
    (v): v is number => v !== null,
  );
  const avgEye = eyeValues.length > 0 ? eyeValues.reduce((a, b) => a + b, 0) / eyeValues.length : 0.5;
  const eyeScore = avgEye * 25;

  // Talk balance — ideal is 50/50, penalize deviation
  const talkDeviation = Math.abs(metrics.tutor_talk_pct - 50) / 50; // 0 = perfect, 1 = worst
  const talkScore = (1 - talkDeviation) * 25;

  // Energy (0-1) → 0-25 points
  const energyValues = [metrics.tutor_energy, metrics.student_energy].filter(
    (v): v is number => v !== null,
  );
  const avgEnergy = energyValues.length > 0 ? energyValues.reduce((a, b) => a + b, 0) / energyValues.length : 0.5;
  const energyScore = avgEnergy * 25;

  // Interruption penalty — 0 interruptions = 15 points, 10+ = 0
  const interruptionScore = Math.max(0, 15 - metrics.interruption_count * 1.5);

  // Attention drift penalty — no drift = 10 points, each drifting = -5
  let driftScore = 10;
  if (metrics.tutor_attention_drift) driftScore -= 5;
  if (metrics.student_attention_drift) driftScore -= 5;

  const total = eyeScore + talkScore + energyScore + interruptionScore + driftScore;
  return Math.round(Math.max(0, Math.min(100, total)));
}

/**
 * Format a metric value for display.
 */
export function formatMetricValue(
  metric: MetricName,
  value: number | boolean | null,
): string {
  if (value === null) return "--";

  switch (metric) {
    case "eye_contact":
    case "energy":
      return `${Math.round((value as number) * 100)}%`;
    case "talk_pct":
      return `${Math.round(value as number)}%`;
    case "interruptions":
      return `${value}`;
    case "attention_drift":
      return value ? "Yes" : "No";
  }
}
