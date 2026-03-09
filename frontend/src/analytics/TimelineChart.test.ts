import { describe, it, expect } from "vitest";
import { toChartData } from "./TimelineChart";
import type { MetricSnapshotData } from "./types";

describe("toChartData", () => {
  it("transforms snapshots into chart data points", () => {
    const snapshots: MetricSnapshotData[] = [
      {
        timestamp_ms: 0,
        metrics: {
          tutor_eye_contact: 0.8,
          student_eye_contact: 0.6,
          tutor_talk_pct: 55,
          student_talk_pct: 45,
          interruption_count: 0,
          tutor_energy: 0.7,
          student_energy: 0.5,
          tutor_attention_drift: false,
          student_attention_drift: false,
          drift_reason: null,
        },
      },
      {
        timestamp_ms: 60000,
        metrics: {
          tutor_eye_contact: 0.7,
          student_eye_contact: null,
          tutor_talk_pct: 60,
          student_talk_pct: 40,
          interruption_count: 1,
          tutor_energy: 0.6,
          student_energy: null,
          tutor_attention_drift: false,
          student_attention_drift: false,
          drift_reason: null,
        },
      },
    ];

    const result = toChartData(snapshots);
    expect(result).toHaveLength(2);

    expect(result[0].time).toBe("0:00");
    expect(result[0].tutor_eye_contact).toBe(0.8);
    expect(result[0].student_eye_contact).toBe(0.6);
    expect(result[0].tutor_talk_pct).toBe(55);

    expect(result[1].time).toBe("1:00");
    expect(result[1].student_eye_contact).toBeNull();
    expect(result[1].tutor_talk_pct).toBe(60);
  });

  it("returns empty array for empty snapshots", () => {
    expect(toChartData([])).toEqual([]);
  });

  it("formats multi-minute timestamps correctly", () => {
    const snapshots: MetricSnapshotData[] = [
      {
        timestamp_ms: 125000,
        metrics: {
          tutor_eye_contact: 0.5,
          student_eye_contact: 0.5,
          tutor_talk_pct: 50,
          student_talk_pct: 50,
          interruption_count: 0,
          tutor_energy: 0.5,
          student_energy: 0.5,
          tutor_attention_drift: false,
          student_attention_drift: false,
          drift_reason: null,
        },
      },
    ];
    const result = toChartData(snapshots);
    expect(result[0].time).toBe("2:05");
  });
});
