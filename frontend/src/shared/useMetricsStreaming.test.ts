import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMetricsStreaming } from "./useMetricsStreaming";

function createMockWebSocket(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as WebSocket;
}

describe("useMetricsStreaming", () => {
  let mockWs: WebSocket;

  beforeEach(() => {
    mockWs = createMockWebSocket();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends metrics at 500ms intervals when streaming", () => {
    const { result } = renderHook(() =>
      useMetricsStreaming(mockWs, 0.85, 0.6),
    );

    expect(result.current.isStreaming).toBe(true);

    // Advance 500ms to trigger first send
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mockWs.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(
      (mockWs.send as ReturnType<typeof vi.fn>).mock.calls[0][0],
    );
    expect(sent.type).toBe("client_metrics");
    expect(sent.data.eye_contact_score).toBe(0.85);
    expect(sent.data.facial_energy).toBe(0.6);
    expect(typeof sent.timestamp).toBe("number");
  });

  it("sends multiple metrics over time", () => {
    renderHook(() => useMetricsStreaming(mockWs, 0.85, 0.6));

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // 500ms, 1000ms, 1500ms = 3 sends
    expect(mockWs.send).toHaveBeenCalledTimes(3);
  });

  it("sends null values when face not detected", () => {
    renderHook(() => useMetricsStreaming(mockWs, null, null));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mockWs.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(
      (mockWs.send as ReturnType<typeof vi.fn>).mock.calls[0][0],
    );
    expect(sent.data.eye_contact_score).toBeNull();
    expect(sent.data.facial_energy).toBeNull();
  });

  it("does not send when WebSocket is not open", () => {
    const closedWs = {
      ...mockWs,
      readyState: WebSocket.CLOSED,
    } as unknown as WebSocket;

    const { result } = renderHook(() =>
      useMetricsStreaming(closedWs, 0.85, 0.6),
    );

    expect(result.current.isStreaming).toBe(false);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(closedWs.send).not.toHaveBeenCalled();
  });

  it("does not send when WebSocket is null", () => {
    const { result } = renderHook(() =>
      useMetricsStreaming(null, 0.85, 0.6),
    );

    expect(result.current.isStreaming).toBe(false);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    // Should not throw
  });

  it("stops streaming on unmount", () => {
    const { unmount } = renderHook(() =>
      useMetricsStreaming(mockWs, 0.85, 0.6),
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(mockWs.send).toHaveBeenCalledTimes(1);

    unmount();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // No additional sends after unmount
    expect(mockWs.send).toHaveBeenCalledTimes(1);
  });

  it("uses latest metric values on each send", () => {
    const { rerender } = renderHook(
      ({ ws, eye, energy }) => useMetricsStreaming(ws, eye, energy),
      { initialProps: { ws: mockWs, eye: 0.9 as number | null, energy: 0.7 as number | null } },
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });

    const first = JSON.parse(
      (mockWs.send as ReturnType<typeof vi.fn>).mock.calls[0][0],
    );
    expect(first.data.eye_contact_score).toBe(0.9);

    // Update metric values
    rerender({ ws: mockWs, eye: 0.3, energy: 0.2 });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    const second = JSON.parse(
      (mockWs.send as ReturnType<typeof vi.fn>).mock.calls[1][0],
    );
    expect(second.data.eye_contact_score).toBe(0.3);
    expect(second.data.facial_energy).toBe(0.2);
  });
});
