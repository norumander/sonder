import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SessionDetail } from "./SessionDetail";
import type { MetricSnapshotData, SessionNudge, SessionSummaryData } from "./types";

// Mock Recharts to avoid rendering issues in jsdom
vi.mock("recharts", () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="mock-line-chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockSummary: SessionSummaryData = {
  tutor_metrics: {
    eye_contact: { avg: 0.8, min: 0.5, max: 1.0 },
    energy: { avg: 0.7, min: 0.4, max: 0.9 },
  },
  student_metrics: {
    eye_contact: { avg: 0.6, min: 0.2, max: 0.9 },
    energy: { avg: 0.5, min: 0.3, max: 0.8 },
  },
  talk_time_ratio: { tutor_pct: 55, student_pct: 45 },
  total_interruptions: 3,
  interruption_attribution: { tutor_count: 1, student_count: 2 },
  flagged_moments: [],
  recommendations: ["Try asking more open-ended questions.", "Watch your talk time balance."],
  overall_engagement_score: 72,
};

const mockSnapshots: MetricSnapshotData[] = [
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
];

const mockNudges: SessionNudge[] = [
  {
    timestamp_ms: 500,
    nudge_type: "student_silent",
    message: "Your student has been quiet.",
    priority: "medium",
  },
  {
    timestamp_ms: 1500,
    nudge_type: "tutor_dominant",
    message: "You've been talking a lot.",
    priority: "high",
  },
];

describe("SessionDetail", () => {
  const defaultProps = {
    summary: mockSummary,
    snapshots: mockSnapshots,
    nudges: mockNudges,
    loading: false,
    error: null,
    onBack: vi.fn(),
  };

  it("renders session detail with summary data", () => {
    render(<SessionDetail {...defaultProps} />);

    expect(screen.getByTestId("session-detail")).toBeInTheDocument();
    expect(screen.getByTestId("engagement-score")).toBeInTheDocument();
    expect(screen.getByText("72")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(<SessionDetail {...defaultProps} loading={true} summary={null} />);
    expect(screen.getByTestId("detail-loading")).toBeInTheDocument();
  });

  it("shows error state", () => {
    render(<SessionDetail {...defaultProps} error="Failed" summary={null} />);
    expect(screen.getByTestId("detail-error")).toBeInTheDocument();
  });

  it("renders talk time ratio", () => {
    render(<SessionDetail {...defaultProps} />);
    const talkTime = screen.getByTestId("talk-time");
    expect(talkTime).toHaveTextContent("55%");
    expect(talkTime).toHaveTextContent("45%");
  });

  it("renders interruption data", () => {
    render(<SessionDetail {...defaultProps} />);
    const interruptions = screen.getByTestId("interruptions");
    expect(interruptions).toHaveTextContent("3");
    expect(interruptions).toHaveTextContent("1");
    expect(interruptions).toHaveTextContent("2");
  });

  it("renders tutor and student metric summaries", () => {
    render(<SessionDetail {...defaultProps} />);
    expect(screen.getByTestId("summary-tutor")).toBeInTheDocument();
    expect(screen.getByTestId("summary-student")).toBeInTheDocument();
    // Tutor eye contact avg 80%
    expect(screen.getByTestId("summary-tutor")).toHaveTextContent("80%");
    // Student eye contact avg 60%
    expect(screen.getByTestId("summary-student")).toHaveTextContent("60%");
  });

  it("renders recommendations", () => {
    render(<SessionDetail {...defaultProps} />);
    expect(screen.getByTestId("recommendations")).toBeInTheDocument();
    expect(screen.getByText("Try asking more open-ended questions.")).toBeInTheDocument();
  });

  it("renders nudge list", () => {
    render(<SessionDetail {...defaultProps} />);
    expect(screen.getByTestId("nudge-list")).toBeInTheDocument();
    expect(screen.getByTestId("nudge-item-0")).toBeInTheDocument();
    expect(screen.getByTestId("nudge-item-1")).toBeInTheDocument();
    expect(screen.getByText("Your student has been quiet.")).toBeInTheDocument();
  });

  it("renders timeline chart", () => {
    render(<SessionDetail {...defaultProps} />);
    expect(screen.getByTestId("timeline-chart")).toBeInTheDocument();
  });

  it("calls onBack when back button clicked", () => {
    const onBack = vi.fn();
    render(<SessionDetail {...defaultProps} onBack={onBack} />);

    fireEvent.click(screen.getByTestId("back-button"));
    expect(onBack).toHaveBeenCalled();
  });

  it("hides nudge list when no nudges", () => {
    render(<SessionDetail {...defaultProps} nudges={[]} />);
    expect(screen.queryByTestId("nudge-list")).not.toBeInTheDocument();
  });

  it("hides recommendations when empty", () => {
    render(
      <SessionDetail {...defaultProps} summary={{ ...mockSummary, recommendations: [] }} />,
    );
    expect(screen.queryByTestId("recommendations")).not.toBeInTheDocument();
  });
});
