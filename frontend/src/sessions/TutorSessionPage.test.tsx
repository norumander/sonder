import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TutorSessionPage } from "./TutorSessionPage";

// Mock all hooks so we can test wiring in isolation

const defaultMediaCapture = {
  videoStream: null,
  status: "active" as const,
  error: null,
  micAvailable: true,
  audioChunks: [],
  consumeAudioChunks: vi.fn(() => []),
};

const mockEndSession = vi.fn();
const defaultLifecycle = {
  sessionEnded: false,
  endReason: null,
  endSession: mockEndSession,
};

const mockUseMediaCapture = vi.fn(() => defaultMediaCapture);
const mockUseSessionLifecycle = vi.fn(() => defaultLifecycle);

vi.mock("../media/useMediaCapture", () => ({
  useMediaCapture: (...args: unknown[]) => mockUseMediaCapture(...args),
}));

vi.mock("../metrics/useFaceMesh", () => ({
  useFaceMesh: vi.fn(() => ({
    eyeContactScore: 0.8,
    facialEnergy: 0.5,
    faceDetected: true,
  })),
}));

vi.mock("../shared/useMetricsStreaming", () => ({
  useMetricsStreaming: vi.fn(),
}));

vi.mock("../shared/useAudioStreaming", () => ({
  useAudioStreaming: vi.fn(() => ({
    sendAudioChunks: vi.fn(),
    isStreaming: true,
  })),
}));

vi.mock("../dashboard/useServerMetrics", () => ({
  useServerMetrics: vi.fn(() => ({
    metrics: null,
    studentConnected: false,
    trends: {
      tutor_eye_contact: "stable",
      student_eye_contact: "stable",
      tutor_energy: "stable",
      student_energy: "stable",
      tutor_talk_pct: "stable",
      student_talk_pct: "stable",
    },
    engagementScore: 0,
    historyLength: 0,
    degradationWarnings: {},
  })),
}));

vi.mock("./useSessionLifecycle", () => ({
  useSessionLifecycle: (...args: unknown[]) => mockUseSessionLifecycle(...args),
}));

vi.mock("../nudges/NudgeContainer", () => ({
  NudgeContainer: () => <div data-testid="nudge-container" />,
}));

vi.mock("../dashboard/LiveDashboard", () => ({
  LiveDashboard: ({ state }: { state: { metrics: unknown } }) => (
    <div data-testid="live-dashboard">
      {state.metrics ? "metrics-loaded" : "waiting"}
    </div>
  ),
}));

vi.mock("./SessionEndedScreen", () => ({
  SessionEndedScreen: ({ reason }: { reason: string | null }) => (
    <div data-testid="session-ended">{reason ?? "ended"}</div>
  ),
}));

describe("TutorSessionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMediaCapture.mockReturnValue(defaultMediaCapture);
    mockUseSessionLifecycle.mockReturnValue(defaultLifecycle);
  });

  it("renders the tutor session layout with dashboard and nudge container", () => {
    render(
      <TutorSessionPage sessionId="s1" token="jwt" ws={null} />,
    );

    expect(screen.getByTestId("tutor-session")).toBeInTheDocument();
    expect(screen.getByTestId("live-dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("nudge-container")).toBeInTheDocument();
    expect(screen.getByText("End Session")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("calls endSession when End Session button is clicked", () => {
    render(
      <TutorSessionPage sessionId="s1" token="jwt" ws={null} />,
    );

    fireEvent.click(screen.getByText("End Session"));
    expect(mockEndSession).toHaveBeenCalledTimes(1);
  });

  it("shows SessionEndedScreen when session is over", () => {
    mockUseSessionLifecycle.mockReturnValue({
      sessionEnded: true,
      endReason: "tutor_ended",
      endSession: vi.fn(),
    });

    render(
      <TutorSessionPage sessionId="s1" token="jwt" ws={null} />,
    );

    expect(screen.getByTestId("session-ended")).toBeInTheDocument();
    expect(screen.queryByTestId("tutor-session")).not.toBeInTheDocument();
  });

  it("shows error message when camera access fails", () => {
    mockUseMediaCapture.mockReturnValue({
      ...defaultMediaCapture,
      status: "error" as const,
      error: "Camera permission denied",
      micAvailable: false,
    });

    render(
      <TutorSessionPage sessionId="s1" token="jwt" ws={null} />,
    );

    expect(screen.getByText("Camera permission denied")).toBeInTheDocument();
    expect(screen.queryByTestId("tutor-session")).not.toBeInTheDocument();
  });

  it("passes dashboard waiting state when no metrics yet", () => {
    render(
      <TutorSessionPage sessionId="s1" token="jwt" ws={null} />,
    );

    expect(screen.getByTestId("live-dashboard")).toHaveTextContent("waiting");
  });
});
