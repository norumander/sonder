import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { TutorSessionPage } from "./TutorSessionPage";

// Mock all hooks so we can test wiring in isolation

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockToggleMute = vi.fn();
const defaultMediaCapture = {
  videoStream: null,
  status: "active" as const,
  error: null,
  micAvailable: true,
  audioChunks: [],
  consumeAudioChunks: vi.fn(() => []),
  isMuted: false,
  toggleMute: mockToggleMute,
};

const mockEndSession = vi.fn();
const defaultLifecycle = {
  sessionEnded: false,
  endReason: null,
  endSession: mockEndSession,
};

const mockUseMediaCapture = vi.fn(() => defaultMediaCapture);
const mockUseTutorSessionControl = vi.fn(() => defaultLifecycle);

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

vi.mock("./useTutorSessionControl", () => ({
  useTutorSessionControl: (...args: unknown[]) => mockUseTutorSessionControl(...args),
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

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("TutorSessionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMediaCapture.mockReturnValue(defaultMediaCapture);
    mockUseTutorSessionControl.mockReturnValue(defaultLifecycle);
  });

  it("renders the tutor session layout with dashboard and nudge container", () => {
    renderWithRouter(
      <TutorSessionPage sessionId="s1" token="jwt" ws={null} />,
    );

    expect(screen.getByTestId("tutor-session")).toBeInTheDocument();
    expect(screen.getByTestId("live-dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("nudge-container")).toBeInTheDocument();
    expect(screen.getByText("End Session")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("calls endSession when End Session button is clicked", () => {
    renderWithRouter(
      <TutorSessionPage sessionId="s1" token="jwt" ws={null} />,
    );

    fireEvent.click(screen.getByText("End Session"));
    expect(mockEndSession).toHaveBeenCalledTimes(1);
  });

  it("navigates to analytics when session ends", () => {
    mockUseTutorSessionControl.mockReturnValue({
      sessionEnded: true,
      endReason: "tutor_ended",
      endSession: vi.fn(),
    });

    renderWithRouter(
      <TutorSessionPage sessionId="s1" token="jwt" ws={null} />,
    );

    expect(mockNavigate).toHaveBeenCalledWith("/analytics/s1", { replace: true });
  });

  it("shows error message when camera access fails", () => {
    mockUseMediaCapture.mockReturnValue({
      ...defaultMediaCapture,
      status: "error" as const,
      error: "Camera permission denied",
      micAvailable: false,
    });

    renderWithRouter(
      <TutorSessionPage sessionId="s1" token="jwt" ws={null} />,
    );

    expect(screen.getByText("Camera permission denied")).toBeInTheDocument();
    expect(screen.queryByTestId("tutor-session")).not.toBeInTheDocument();
  });

  it("passes dashboard waiting state when no metrics yet", () => {
    renderWithRouter(
      <TutorSessionPage sessionId="s1" token="jwt" ws={null} />,
    );

    expect(screen.getByTestId("live-dashboard")).toHaveTextContent("waiting");
  });

  it("renders mute toggle button", () => {
    renderWithRouter(
      <TutorSessionPage sessionId="s1" token="jwt" ws={null} />,
    );

    expect(screen.getByTestId("mute-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("mute-toggle")).toHaveTextContent("Mic");
  });

  it("calls toggleMute when mute button is clicked", () => {
    renderWithRouter(
      <TutorSessionPage sessionId="s1" token="jwt" ws={null} />,
    );

    fireEvent.click(screen.getByTestId("mute-toggle"));
    expect(mockToggleMute).toHaveBeenCalledTimes(1);
  });

  it("shows muted state when isMuted is true", () => {
    mockUseMediaCapture.mockReturnValue({
      ...defaultMediaCapture,
      isMuted: true,
    });

    renderWithRouter(
      <TutorSessionPage sessionId="s1" token="jwt" ws={null} />,
    );

    expect(screen.getByTestId("mute-toggle")).toHaveTextContent("Muted");
  });
});
