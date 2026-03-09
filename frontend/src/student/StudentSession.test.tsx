import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StudentSession } from "./StudentSession";

// Mock useMediaCapture
vi.mock("../media/useMediaCapture", () => ({
  useMediaCapture: vi.fn(() => ({
    videoStream: null,
    status: "active" as const,
    error: null,
    micAvailable: true,
    audioChunks: [],
    consumeAudioChunks: vi.fn(() => []),
  })),
}));

// Mock useFaceMesh
vi.mock("../metrics/useFaceMesh", () => ({
  useFaceMesh: vi.fn(() => ({
    eyeContactScore: 0.8,
    facialEnergy: 0.5,
    faceDetected: true,
  })),
}));

// Mock useMetricsStreaming
vi.mock("../shared/useMetricsStreaming", () => ({
  useMetricsStreaming: vi.fn(() => ({ isStreaming: true })),
}));

// Mock useAudioStreaming
vi.mock("../shared/useAudioStreaming", () => ({
  useAudioStreaming: vi.fn(() => ({
    sendAudioChunks: vi.fn(),
    isStreaming: true,
  })),
}));

// Mock useSessionLifecycle
vi.mock("../sessions/useSessionLifecycle", () => ({
  useSessionLifecycle: vi.fn(() => ({
    sessionEnded: false,
    endReason: null,
    endSession: vi.fn(),
  })),
}));

describe("StudentSession", () => {
  let mockWs: WebSocket;

  beforeEach(() => {
    mockWs = {
      readyState: WebSocket.OPEN,
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as WebSocket;
  });

  it("renders session active indicator", () => {
    render(
      <StudentSession
        sessionId="sess-1"
        token="tok-1"
        ws={mockWs}
      />,
    );

    expect(screen.getByText(/session active/i)).toBeInTheDocument();
  });

  it("renders leave session button", () => {
    render(
      <StudentSession
        sessionId="sess-1"
        token="tok-1"
        ws={mockWs}
      />,
    );

    expect(screen.getByRole("button", { name: /leave session/i })).toBeInTheDocument();
  });

  it("renders webcam preview video element", () => {
    render(
      <StudentSession
        sessionId="sess-1"
        token="tok-1"
        ws={mockWs}
      />,
    );

    const video = document.querySelector("video");
    expect(video).toBeInTheDocument();
  });

  it("does not render any metric values", () => {
    render(
      <StudentSession
        sessionId="sess-1"
        token="tok-1"
        ws={mockWs}
      />,
    );

    // No metric-related text should appear
    expect(screen.queryByText(/eye contact/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/talk time/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/energy/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/interruption/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/attention drift/i)).not.toBeInTheDocument();
  });

  it("does not render any nudge components", () => {
    render(
      <StudentSession
        sessionId="sess-1"
        token="tok-1"
        ws={mockWs}
      />,
    );

    expect(screen.queryByText(/nudge/i)).not.toBeInTheDocument();
  });

  it("shows session ended screen when session ends", async () => {
    const { useSessionLifecycle } = await import("../sessions/useSessionLifecycle");
    const mockedHook = vi.mocked(useSessionLifecycle);

    mockedHook.mockReturnValue({
      sessionEnded: true,
      endReason: "tutor_ended",
      endSession: vi.fn(),
    });

    render(
      <StudentSession
        sessionId="sess-1"
        token="tok-1"
        ws={mockWs}
      />,
    );

    expect(screen.getByText(/session ended/i)).toBeInTheDocument();
  });

  it("calls endSession when leave button is clicked", async () => {
    const mockEndSession = vi.fn();
    const { useSessionLifecycle } = await import("../sessions/useSessionLifecycle");
    const mockedHook = vi.mocked(useSessionLifecycle);

    mockedHook.mockReturnValue({
      sessionEnded: false,
      endReason: null,
      endSession: mockEndSession,
    });

    render(
      <StudentSession
        sessionId="sess-1"
        token="tok-1"
        ws={mockWs}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /leave session/i }));
    expect(mockEndSession).toHaveBeenCalled();
  });

  it("shows media error when camera is denied", async () => {
    const { useMediaCapture } = await import("../media/useMediaCapture");
    const mockedHook = vi.mocked(useMediaCapture);

    mockedHook.mockReturnValue({
      videoStream: null,
      status: "error",
      error: "Camera access denied. Please allow camera access to start a session.",
      micAvailable: false,
      audioChunks: [],
      consumeAudioChunks: vi.fn(() => []),
    });

    render(
      <StudentSession
        sessionId="sess-1"
        token="tok-1"
        ws={mockWs}
      />,
    );

    expect(screen.getByText(/camera access denied/i)).toBeInTheDocument();
  });
});
