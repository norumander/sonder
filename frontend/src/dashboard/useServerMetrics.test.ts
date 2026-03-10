import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useServerMetrics } from "./useServerMetrics";
import type { ServerMetrics } from "../shared/types";

function createMockWebSocket(): WebSocket {
  const listeners: Record<string, EventListener[]> = {};
  return {
    readyState: WebSocket.OPEN,
    addEventListener: vi.fn((event: string, cb: EventListener) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    }),
    removeEventListener: vi.fn((event: string, cb: EventListener) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((l) => l !== cb);
      }
    }),
    // Helper to simulate incoming messages
    _emit(_type: string, data: unknown) {
      const event = new MessageEvent("message", {
        data: JSON.stringify(data),
      });
      listeners["message"]?.forEach((cb) => cb(event));
    },
  } as unknown as WebSocket & { _emit: (type: string, data: unknown) => void };
}

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

describe("useServerMetrics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null metrics when no WebSocket provided", () => {
    const { result } = renderHook(() => useServerMetrics(null));
    expect(result.current.metrics).toBeNull();
    expect(result.current.studentConnected).toBe(false);
  });

  it("updates metrics on server_metrics message", () => {
    const ws = createMockWebSocket();
    const { result } = renderHook(() => useServerMetrics(ws));

    const data = makeMetrics();
    act(() => {
      (ws as any)._emit("message", { type: "server_metrics", data });
    });

    expect(result.current.metrics).toEqual(data);
  });

  it("tracks student connection status from student_status messages", () => {
    const ws = createMockWebSocket();
    const { result } = renderHook(() => useServerMetrics(ws));

    expect(result.current.studentConnected).toBe(false);

    act(() => {
      (ws as any)._emit("message", {
        type: "student_status",
        data: { connected: true },
      });
    });
    expect(result.current.studentConnected).toBe(true);

    act(() => {
      (ws as any)._emit("message", {
        type: "student_status",
        data: { connected: false },
      });
    });
    expect(result.current.studentConnected).toBe(false);
  });

  it("computes trends from accumulated history", () => {
    const ws = createMockWebSocket();
    const { result } = renderHook(() => useServerMetrics(ws));

    // Send improving eye contact values
    const values = [0.3, 0.4, 0.5, 0.6, 0.7];
    values.forEach((v, i) => {
      act(() => {
        (ws as any)._emit("message", {
          type: "server_metrics",
          data: makeMetrics({
            tutor_eye_contact: v,
            timestamp_ms: i * 1000,
          }),
        });
      });
    });

    expect(result.current.trends.tutor_eye_contact).toBe("improving");
  });

  it("computes engagement score from current metrics", () => {
    const ws = createMockWebSocket();
    const { result } = renderHook(() => useServerMetrics(ws));

    act(() => {
      (ws as any)._emit("message", {
        type: "server_metrics",
        data: makeMetrics(),
      });
    });

    expect(result.current.engagementScore).toBeGreaterThan(0);
    expect(result.current.engagementScore).toBeLessThanOrEqual(100);
  });

  it("limits history to last 2 minutes of samples", () => {
    const ws = createMockWebSocket();
    const { result } = renderHook(() => useServerMetrics(ws));

    // Send 300 metrics (simulating 5 min at ~1Hz)
    for (let i = 0; i < 300; i++) {
      act(() => {
        (ws as any)._emit("message", {
          type: "server_metrics",
          data: makeMetrics({ timestamp_ms: i * 1000 }),
        });
      });
    }

    // History should be capped (240 samples = 2 min at ~2Hz, generous cap)
    expect(result.current.historyLength).toBeLessThanOrEqual(240);
  });

  it("cleans up WebSocket listener on unmount", () => {
    const ws = createMockWebSocket();
    const { unmount } = renderHook(() => useServerMetrics(ws));

    unmount();

    expect(ws.removeEventListener).toHaveBeenCalledWith(
      "message",
      expect.any(Function),
    );
  });

  it("ignores heartbeat messages", () => {
    const ws = createMockWebSocket();
    const { result } = renderHook(() => useServerMetrics(ws));

    act(() => {
      (ws as any)._emit("message", { type: "heartbeat" });
    });

    expect(result.current.metrics).toBeNull();
  });

  it("initializes with empty degradation warnings", () => {
    const ws = createMockWebSocket();
    const { result } = renderHook(() => useServerMetrics(ws));
    expect(result.current.degradationWarnings).toEqual({});
  });

  it("tracks degradation_warning activation", () => {
    const ws = createMockWebSocket();
    const { result } = renderHook(() => useServerMetrics(ws));

    act(() => {
      (ws as any)._emit("message", {
        type: "degradation_warning",
        data: {
          role: "student",
          warning_type: "face_not_detected",
          active: true,
        },
      });
    });

    expect(result.current.degradationWarnings["student:face_not_detected"]).toBe(true);
  });

  it("tracks degradation_warning deactivation", () => {
    const ws = createMockWebSocket();
    const { result } = renderHook(() => useServerMetrics(ws));

    act(() => {
      (ws as any)._emit("message", {
        type: "degradation_warning",
        data: {
          role: "student",
          warning_type: "face_not_detected",
          active: true,
        },
      });
    });
    expect(result.current.degradationWarnings["student:face_not_detected"]).toBe(true);

    act(() => {
      (ws as any)._emit("message", {
        type: "degradation_warning",
        data: {
          role: "student",
          warning_type: "face_not_detected",
          active: false,
        },
      });
    });
    expect(result.current.degradationWarnings["student:face_not_detected"]).toBe(false);
  });

  it("tracks multiple degradation warnings independently", () => {
    const ws = createMockWebSocket();
    const { result } = renderHook(() => useServerMetrics(ws));

    act(() => {
      (ws as any)._emit("message", {
        type: "degradation_warning",
        data: { role: "student", warning_type: "face_not_detected", active: true },
      });
    });
    act(() => {
      (ws as any)._emit("message", {
        type: "degradation_warning",
        data: { role: "tutor", warning_type: "audio_unavailable", active: true },
      });
    });

    expect(result.current.degradationWarnings["student:face_not_detected"]).toBe(true);
    expect(result.current.degradationWarnings["tutor:audio_unavailable"]).toBe(true);
  });
});
