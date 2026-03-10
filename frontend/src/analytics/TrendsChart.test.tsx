import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { toTrendChartData, TrendsChart } from "./TrendsChart";
import type { TrendDataPoint } from "./types";

// Mock Recharts to avoid rendering issues in tests
vi.mock("recharts", () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function makeTrendPoint(overrides: Partial<TrendDataPoint> = {}): TrendDataPoint {
  return {
    session_id: "s-1",
    start_time: "2026-03-07T10:00:00+00:00",
    end_time: "2026-03-07T10:30:00+00:00",
    tutor_eye_contact: 0.8,
    student_eye_contact: 0.6,
    tutor_energy: 0.7,
    student_energy: 0.5,
    tutor_talk_pct: 55,
    student_talk_pct: 45,
    total_interruptions: 3,
    engagement_score: 75,
    ...overrides,
  };
}

describe("toTrendChartData", () => {
  it("transforms trend data into chart points", () => {
    const sessions: TrendDataPoint[] = [
      makeTrendPoint({ start_time: "2026-03-07T10:00:00+00:00" }),
      makeTrendPoint({ start_time: "2026-03-08T10:00:00+00:00", engagement_score: 85 }),
    ];
    const result = toTrendChartData(sessions);
    expect(result).toHaveLength(2);
    expect(result[0].engagement_score).toBe(75);
    expect(result[1].engagement_score).toBe(85);
    expect(result[0].label).toBe("Mar 7");
    expect(result[1].label).toBe("Mar 8");
  });

  it("uses index-based label when start_time is null", () => {
    const sessions: TrendDataPoint[] = [makeTrendPoint({ start_time: null })];
    const result = toTrendChartData(sessions);
    expect(result[0].label).toBe("#1");
  });

  it("returns empty array for empty input", () => {
    expect(toTrendChartData([])).toEqual([]);
  });
});

describe("TrendsChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows empty state when fewer than 2 sessions", () => {
    render(<TrendsChart sessions={[makeTrendPoint()]} />);
    expect(screen.getByTestId("trends-empty")).toBeInTheDocument();
    expect(screen.getByText(/Complete more sessions to see trends/)).toBeInTheDocument();
  });

  it("shows empty state for zero sessions", () => {
    render(<TrendsChart sessions={[]} />);
    expect(screen.getByTestId("trends-empty")).toBeInTheDocument();
  });

  it("renders charts when 2+ sessions provided", () => {
    const sessions = [
      makeTrendPoint({ session_id: "s-1" }),
      makeTrendPoint({ session_id: "s-2" }),
    ];
    render(<TrendsChart sessions={sessions} />);
    expect(screen.getByTestId("trends-chart")).toBeInTheDocument();
    expect(screen.queryByTestId("trends-empty")).not.toBeInTheDocument();
  });

  it("renders all 4 chart sections", () => {
    const sessions = [
      makeTrendPoint({ session_id: "s-1" }),
      makeTrendPoint({ session_id: "s-2" }),
    ];
    render(<TrendsChart sessions={sessions} />);
    expect(screen.getByText("Eye Contact (avg)")).toBeInTheDocument();
    expect(screen.getByText("Energy (avg)")).toBeInTheDocument();
    expect(screen.getByText("Talk Time %")).toBeInTheDocument();
    expect(screen.getByText("Engagement Score")).toBeInTheDocument();
  });

  it("renders tutor and student line series", () => {
    const sessions = [
      makeTrendPoint({ session_id: "s-1" }),
      makeTrendPoint({ session_id: "s-2" }),
    ];
    render(<TrendsChart sessions={sessions} />);
    // 4 charts: eye contact (2 lines), energy (2 lines), talk time (2 lines), engagement (1 line) = 7 Line components
    const lines = screen.getAllByTestId("line");
    expect(lines).toHaveLength(7);
  });
});
