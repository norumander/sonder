import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveDashboard } from "./LiveDashboard";
import type { ServerMetricsState } from "./useServerMetrics";
import type { ServerMetrics } from "../shared/types";

function makeMetrics(overrides: Partial<ServerMetrics> = {}): ServerMetrics {
  return {
    tutor_eye_contact: 0.8,
    student_eye_contact: 0.7,
    tutor_talk_pct: 55,
    student_talk_pct: 45,
    interruption_count: 1,
    tutor_energy: 0.6,
    student_energy: 0.5,
    tutor_attention_drift: false,
    student_attention_drift: false,
    drift_reason: null,
    timestamp_ms: 1000,
    ...overrides,
  };
}

function makeState(overrides: Partial<ServerMetricsState> = {}): ServerMetricsState {
  return {
    metrics: makeMetrics(),
    studentConnected: true,
    trends: {
      tutor_eye_contact: "stable",
      student_eye_contact: "stable",
      tutor_energy: "stable",
      student_energy: "stable",
      tutor_talk_pct: "stable",
      student_talk_pct: "stable",
    },
    engagementScore: 75,
    historyLength: 10,
    degradationWarnings: {},
    ...overrides,
  };
}

describe("LiveDashboard", () => {
  it("shows waiting state when no metrics received", () => {
    render(<LiveDashboard state={makeState({ metrics: null })} />);
    expect(screen.getByTestId("dashboard-waiting")).toBeInTheDocument();
    expect(screen.getByText("Waiting for metrics...")).toBeInTheDocument();
  });

  it("renders tutor and student sections", () => {
    render(<LiveDashboard state={makeState()} />);
    expect(screen.getByTestId("section-tutor")).toBeInTheDocument();
    expect(screen.getByTestId("section-student")).toBeInTheDocument();
  });

  it("displays engagement score", () => {
    render(<LiveDashboard state={makeState({ engagementScore: 82 })} />);
    const badge = screen.getByTestId("engagement-score");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("82");
  });

  it("displays metric values from server metrics", () => {
    render(<LiveDashboard state={makeState()} />);
    // Tutor eye contact 0.8 → "80%"
    // Student eye contact 0.7 → "70%"
    // Interruptions 1 → "1"
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders metric cards with correct color status", () => {
    const state = makeState({
      metrics: makeMetrics({
        tutor_eye_contact: 0.1, // red
        student_eye_contact: 0.9, // green
      }),
    });
    render(<LiveDashboard state={state} />);

    const cards = screen.getAllByTestId("metric-card-eye-contact");
    // First is tutor (red), second is student (green)
    expect(cards[0]).toHaveAttribute("data-status", "red");
    expect(cards[1]).toHaveAttribute("data-status", "green");
  });

  it("shows trend arrows when trends are non-stable", () => {
    const state = makeState({
      trends: {
        tutor_eye_contact: "improving",
        student_eye_contact: "declining",
        tutor_energy: "stable",
        student_energy: "stable",
        tutor_talk_pct: "stable",
        student_talk_pct: "stable",
      },
    });
    render(<LiveDashboard state={state} />);
    const arrows = screen.getAllByTestId("trend-arrow");
    expect(arrows.length).toBeGreaterThan(0);
  });

  it("shows student connection indicator", () => {
    const { rerender } = render(
      <LiveDashboard state={makeState({ studentConnected: true })} />,
    );
    const connectedDot = screen.getByTitle("Connected");
    expect(connectedDot).toBeInTheDocument();

    rerender(
      <LiveDashboard state={makeState({ studentConnected: false })} />,
    );
    const disconnectedDot = screen.getByTitle("Disconnected");
    expect(disconnectedDot).toBeInTheDocument();
  });

  it("handles null student metrics gracefully", () => {
    const state = makeState({
      metrics: makeMetrics({
        student_eye_contact: null,
        student_energy: null,
      }),
    });
    render(<LiveDashboard state={state} />);
    // Should render "--" for null values
    const dashes = screen.getAllByText("--");
    expect(dashes.length).toBe(2);
  });

  it("updates visually when metrics change", () => {
    const state1 = makeState({ engagementScore: 60 });
    const { rerender } = render(<LiveDashboard state={state1} />);
    expect(screen.getByTestId("engagement-score")).toHaveTextContent("60");

    const state2 = makeState({ engagementScore: 85 });
    rerender(<LiveDashboard state={state2} />);
    expect(screen.getByTestId("engagement-score")).toHaveTextContent("85");
  });

  it("shows face not detected warning for student", () => {
    const state = makeState({
      degradationWarnings: { "student:face_not_detected": true },
    });
    render(<LiveDashboard state={state} />);
    expect(screen.getByTestId("warning-student-face")).toBeInTheDocument();
    expect(screen.getByText("Student face not detected")).toBeInTheDocument();
  });

  it("shows face not detected warning for tutor", () => {
    const state = makeState({
      degradationWarnings: { "tutor:face_not_detected": true },
    });
    render(<LiveDashboard state={state} />);
    expect(screen.getByTestId("warning-tutor-face")).toBeInTheDocument();
    expect(screen.getByText("Tutor face not detected")).toBeInTheDocument();
  });

  it("shows audio unavailable warning", () => {
    const state = makeState({
      degradationWarnings: { "student:audio_unavailable": true },
    });
    render(<LiveDashboard state={state} />);
    expect(screen.getByTestId("warning-student-audio")).toBeInTheDocument();
    expect(screen.getByText("Student audio unavailable")).toBeInTheDocument();
  });

  it("shows student disconnected warning when not connected", () => {
    const state = makeState({ studentConnected: false });
    render(<LiveDashboard state={state} />);
    expect(screen.getByTestId("warning-student-disconnected")).toBeInTheDocument();
    expect(screen.getByText("Student disconnected")).toBeInTheDocument();
  });

  it("does not show disconnected warning when connected", () => {
    const state = makeState({ studentConnected: true });
    render(<LiveDashboard state={state} />);
    expect(screen.queryByTestId("warning-student-disconnected")).not.toBeInTheDocument();
  });

  it("clears warning when degradation resolves", () => {
    const state1 = makeState({
      degradationWarnings: { "student:face_not_detected": true },
    });
    const { rerender } = render(<LiveDashboard state={state1} />);
    expect(screen.getByTestId("warning-student-face")).toBeInTheDocument();

    const state2 = makeState({
      degradationWarnings: { "student:face_not_detected": false },
    });
    rerender(<LiveDashboard state={state2} />);
    expect(screen.queryByTestId("warning-student-face")).not.toBeInTheDocument();
  });

  it("shows multiple warnings simultaneously", () => {
    const state = makeState({
      studentConnected: false,
      degradationWarnings: {
        "student:face_not_detected": true,
        "student:audio_unavailable": true,
      },
    });
    render(<LiveDashboard state={state} />);
    expect(screen.getByTestId("warning-student-disconnected")).toBeInTheDocument();
    expect(screen.getByTestId("warning-student-face")).toBeInTheDocument();
    expect(screen.getByTestId("warning-student-audio")).toBeInTheDocument();
  });
});
