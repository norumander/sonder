/**
 * Utility functions for metric status, trends, engagement scoring, and formatting.
 */

import type { MetricStatus, ServerMetrics, TrendDirection } from "../shared/types";

type MetricName = "eye_contact" | "talk_pct" | "energy" | "interruptions" | "attention_drift";

// Status thresholds for metric color coding
const EYE_CONTACT_GREEN = 0.6;
const EYE_CONTACT_YELLOW = 0.3;
const TALK_PCT_IDEAL_LOW = 40;
const TALK_PCT_IDEAL_HIGH = 60;
const TALK_PCT_WARN_LOW = 25;
const TALK_PCT_WARN_HIGH = 75;
const ENERGY_GREEN = 0.5;
const ENERGY_YELLOW = 0.3;
const INTERRUPTIONS_GREEN = 3;
const INTERRUPTIONS_YELLOW = 6;

// Trend analysis
const MIN_TREND_SAMPLES = 4;
const TREND_THRESHOLD = 0.05;

// Engagement score weights
const WEIGHT_EYE = 25;
const WEIGHT_TALK = 25;
const WEIGHT_ENERGY = 25;
const WEIGHT_INTERRUPTIONS = 15;
const WEIGHT_DRIFT = 10;
const INTERRUPTION_PENALTY_RATE = 1.5;
const DRIFT_PENALTY_PER_PARTICIPANT = 5;

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
      if (v >= EYE_CONTACT_GREEN) return "green";
      if (v >= EYE_CONTACT_YELLOW) return "yellow";
      return "red";
    }
    case "talk_pct": {
      const v = value as number;
      if (v >= TALK_PCT_IDEAL_LOW && v <= TALK_PCT_IDEAL_HIGH) return "green";
      if (v >= TALK_PCT_WARN_LOW && v <= TALK_PCT_WARN_HIGH) return "yellow";
      return "red";
    }
    case "energy": {
      const v = value as number;
      if (v >= ENERGY_GREEN) return "green";
      if (v >= ENERGY_YELLOW) return "yellow";
      return "red";
    }
    case "interruptions": {
      const v = value as number;
      if (v <= INTERRUPTIONS_GREEN) return "green";
      if (v <= INTERRUPTIONS_YELLOW) return "yellow";
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
  if (nums.length < MIN_TREND_SAMPLES) return "stable";

  const mid = Math.floor(nums.length / 2);
  const firstHalf = nums.slice(0, mid);
  const secondHalf = nums.slice(mid);

  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  const diff = avgSecond - avgFirst;

  if (diff > TREND_THRESHOLD) return "improving";
  if (diff < -TREND_THRESHOLD) return "declining";
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
  // Eye contact (0-1) → 0-WEIGHT_EYE points
  const eyeValues = [metrics.tutor_eye_contact, metrics.student_eye_contact].filter(
    (v): v is number => v !== null,
  );
  const avgEye = eyeValues.length > 0 ? eyeValues.reduce((a, b) => a + b, 0) / eyeValues.length : 0.5;
  const eyeScore = avgEye * WEIGHT_EYE;

  // Talk balance — ideal is 50/50, penalize deviation
  const talkDeviation = Math.abs(metrics.tutor_talk_pct - 50) / 50; // 0 = perfect, 1 = worst
  const talkScore = (1 - talkDeviation) * WEIGHT_TALK;

  // Energy (0-1) → 0-WEIGHT_ENERGY points
  const energyValues = [metrics.tutor_energy, metrics.student_energy].filter(
    (v): v is number => v !== null,
  );
  const avgEnergy = energyValues.length > 0 ? energyValues.reduce((a, b) => a + b, 0) / energyValues.length : 0.5;
  const energyScore = avgEnergy * WEIGHT_ENERGY;

  // Interruption penalty — 0 interruptions = max points, 10+ = 0
  const interruptionScore = Math.max(0, WEIGHT_INTERRUPTIONS - metrics.interruption_count * INTERRUPTION_PENALTY_RATE);

  // Attention drift penalty — no drift = max points, each drifting participant loses points
  let driftScore = WEIGHT_DRIFT;
  if (metrics.tutor_attention_drift) driftScore -= DRIFT_PENALTY_PER_PARTICIPANT;
  if (metrics.student_attention_drift) driftScore -= DRIFT_PENALTY_PER_PARTICIPANT;

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
      // Label is "Attention" (positive) — invert the drift boolean:
      // not drifting (false) → "Yes" (attentive), drifting (true) → "No"
      return value ? "No" : "Yes";
  }
}
