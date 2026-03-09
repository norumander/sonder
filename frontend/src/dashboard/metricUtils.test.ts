import { describe, it, expect } from "vitest";
import {
  getMetricStatus,
  computeTrend,
  computeEngagementScore,
  formatMetricValue,
} from "./metricUtils";
import type { ServerMetrics } from "../shared/types";

describe("getMetricStatus", () => {
  // Eye contact thresholds
  it("returns green for eye contact >= 0.6", () => {
    expect(getMetricStatus("eye_contact", 0.8)).toBe("green");
    expect(getMetricStatus("eye_contact", 0.6)).toBe("green");
  });

  it("returns yellow for eye contact 0.3-0.6", () => {
    expect(getMetricStatus("eye_contact", 0.45)).toBe("yellow");
    expect(getMetricStatus("eye_contact", 0.3)).toBe("yellow");
  });

  it("returns red for eye contact < 0.3", () => {
    expect(getMetricStatus("eye_contact", 0.1)).toBe("red");
    expect(getMetricStatus("eye_contact", 0.0)).toBe("red");
  });

  it("returns yellow for null eye contact", () => {
    expect(getMetricStatus("eye_contact", null)).toBe("yellow");
  });

  // Talk percentage — measures balance (ideal: student 30-60%)
  it("returns green for balanced talk time (40-60%)", () => {
    expect(getMetricStatus("talk_pct", 50)).toBe("green");
    expect(getMetricStatus("talk_pct", 40)).toBe("green");
    expect(getMetricStatus("talk_pct", 60)).toBe("green");
  });

  it("returns yellow for slightly imbalanced talk time", () => {
    expect(getMetricStatus("talk_pct", 70)).toBe("yellow");
    expect(getMetricStatus("talk_pct", 30)).toBe("yellow");
  });

  it("returns red for heavily imbalanced talk time", () => {
    expect(getMetricStatus("talk_pct", 85)).toBe("red");
    expect(getMetricStatus("talk_pct", 15)).toBe("red");
  });

  // Energy thresholds
  it("returns green for energy >= 0.5", () => {
    expect(getMetricStatus("energy", 0.7)).toBe("green");
    expect(getMetricStatus("energy", 0.5)).toBe("green");
  });

  it("returns yellow for energy 0.3-0.5", () => {
    expect(getMetricStatus("energy", 0.4)).toBe("yellow");
  });

  it("returns red for energy < 0.3", () => {
    expect(getMetricStatus("energy", 0.1)).toBe("red");
  });

  // Interruption count
  it("returns green for low interruptions", () => {
    expect(getMetricStatus("interruptions", 0)).toBe("green");
    expect(getMetricStatus("interruptions", 3)).toBe("green");
  });

  it("returns yellow for moderate interruptions", () => {
    expect(getMetricStatus("interruptions", 5)).toBe("yellow");
  });

  it("returns red for high interruptions", () => {
    expect(getMetricStatus("interruptions", 8)).toBe("red");
  });

  // Attention drift — binary
  it("returns green for no drift", () => {
    expect(getMetricStatus("attention_drift", false)).toBe("green");
  });

  it("returns red for active drift", () => {
    expect(getMetricStatus("attention_drift", true)).toBe("red");
  });
});

describe("computeTrend", () => {
  it("returns stable when fewer than 4 samples", () => {
    expect(computeTrend([0.5, 0.6])).toBe("stable");
  });

  it("returns improving when values increase significantly", () => {
    expect(computeTrend([0.3, 0.4, 0.5, 0.6, 0.7])).toBe("improving");
  });

  it("returns declining when values decrease significantly", () => {
    expect(computeTrend([0.7, 0.6, 0.5, 0.4, 0.3])).toBe("declining");
  });

  it("returns stable when values fluctuate without clear direction", () => {
    expect(computeTrend([0.5, 0.5, 0.5, 0.5])).toBe("stable");
  });

  it("returns stable for small changes below threshold", () => {
    expect(computeTrend([0.50, 0.51, 0.52, 0.51])).toBe("stable");
  });

  it("handles null values by filtering them out", () => {
    expect(computeTrend([null, 0.3, null, 0.5, 0.6, 0.7])).toBe("improving");
  });

  it("returns stable when all values are null", () => {
    expect(computeTrend([null, null, null, null])).toBe("stable");
  });
});

describe("computeEngagementScore", () => {
  it("returns high score for excellent metrics", () => {
    const metrics: ServerMetrics = {
      tutor_eye_contact: 0.9,
      student_eye_contact: 0.9,
      tutor_talk_pct: 50,
      student_talk_pct: 50,
      interruption_count: 0,
      tutor_energy: 0.8,
      student_energy: 0.8,
      tutor_attention_drift: false,
      student_attention_drift: false,
      drift_reason: null,
      timestamp_ms: 0,
    };
    const score = computeEngagementScore(metrics);
    expect(score).toBeGreaterThanOrEqual(80);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns low score for poor metrics", () => {
    const metrics: ServerMetrics = {
      tutor_eye_contact: 0.1,
      student_eye_contact: 0.1,
      tutor_talk_pct: 90,
      student_talk_pct: 10,
      interruption_count: 10,
      tutor_energy: 0.1,
      student_energy: 0.1,
      tutor_attention_drift: true,
      student_attention_drift: true,
      drift_reason: "low_eye_contact",
      timestamp_ms: 0,
    };
    const score = computeEngagementScore(metrics);
    expect(score).toBeLessThanOrEqual(30);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("handles null values gracefully", () => {
    const metrics: ServerMetrics = {
      tutor_eye_contact: 0.7,
      student_eye_contact: null,
      tutor_talk_pct: 50,
      student_talk_pct: 50,
      interruption_count: 0,
      tutor_energy: 0.7,
      student_energy: null,
      tutor_attention_drift: false,
      student_attention_drift: false,
      drift_reason: null,
      timestamp_ms: 0,
    };
    const score = computeEngagementScore(metrics);
    expect(score).toBeGreaterThanOrEqual(50);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("clamps score between 0 and 100", () => {
    const metrics: ServerMetrics = {
      tutor_eye_contact: 1.0,
      student_eye_contact: 1.0,
      tutor_talk_pct: 50,
      student_talk_pct: 50,
      interruption_count: 0,
      tutor_energy: 1.0,
      student_energy: 1.0,
      tutor_attention_drift: false,
      student_attention_drift: false,
      drift_reason: null,
      timestamp_ms: 0,
    };
    const score = computeEngagementScore(metrics);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe("formatMetricValue", () => {
  it("formats percentages with % suffix", () => {
    expect(formatMetricValue("talk_pct", 45.67)).toBe("46%");
  });

  it("formats scores as percentage (0-1 to 0-100)", () => {
    expect(formatMetricValue("eye_contact", 0.85)).toBe("85%");
    expect(formatMetricValue("energy", 0.6)).toBe("60%");
  });

  it("formats interruption count as integer", () => {
    expect(formatMetricValue("interruptions", 5)).toBe("5");
  });

  it("formats attention drift as Yes/No", () => {
    expect(formatMetricValue("attention_drift", true)).toBe("Yes");
    expect(formatMetricValue("attention_drift", false)).toBe("No");
  });

  it("returns -- for null values", () => {
    expect(formatMetricValue("eye_contact", null)).toBe("--");
    expect(formatMetricValue("energy", null)).toBe("--");
  });
});
