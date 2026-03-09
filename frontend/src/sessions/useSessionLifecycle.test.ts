import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionLifecycle } from "./useSessionLifecycle";

describe("useSessionLifecycle", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let addEventSpy: ReturnType<typeof vi.spyOn>;
  let removeEventSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);
    addEventSpy = vi.spyOn(window, "addEventListener");
    removeEventSpy = vi.spyOn(window, "removeEventListener");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with sessionEnded=false", () => {
    const { result } = renderHook(() =>
      useSessionLifecycle("session-123", "test-token", null),
    );

    expect(result.current.sessionEnded).toBe(false);
    expect(result.current.endReason).toBeNull();
  });

  it("endSession calls PATCH /sessions/{id}/end", async () => {
    const { result } = renderHook(() =>
      useSessionLifecycle("session-123", "test-token", null),
    );

    await act(async () => {
      await result.current.endSession();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/sessions/session-123/end"),
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );
  });

  it("endSession also sends end_session via WebSocket", async () => {
    const mockWs = {
      readyState: WebSocket.OPEN,
      send: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as WebSocket;

    const { result } = renderHook(() =>
      useSessionLifecycle("session-123", "test-token", mockWs),
    );

    await act(async () => {
      await result.current.endSession();
    });

    expect(mockWs.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "end_session" }),
    );
  });

  it("sets sessionEnded when session_ended WS message received", () => {
    const listeners: Record<string, (e: MessageEvent) => void> = {};
    const mockWs = {
      readyState: WebSocket.OPEN,
      send: vi.fn(),
      addEventListener: vi.fn((event: string, handler: (e: MessageEvent) => void) => {
        listeners[event] = handler;
      }),
      removeEventListener: vi.fn(),
    } as unknown as WebSocket;

    const { result } = renderHook(() =>
      useSessionLifecycle("session-123", "test-token", mockWs),
    );

    expect(result.current.sessionEnded).toBe(false);

    // Simulate receiving session_ended message
    act(() => {
      listeners["message"]?.(
        new MessageEvent("message", {
          data: JSON.stringify({
            type: "session_ended",
            data: { reason: "tutor_ended", timestamp_ms: 1000 },
          }),
        }),
      );
    });

    expect(result.current.sessionEnded).toBe(true);
    expect(result.current.endReason).toBe("tutor_ended");
  });

  it("registers beforeunload handler", () => {
    renderHook(() =>
      useSessionLifecycle("session-123", "test-token", null),
    );

    expect(addEventSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );
  });

  it("removes beforeunload handler on unmount", () => {
    const { unmount } = renderHook(() =>
      useSessionLifecycle("session-123", "test-token", null),
    );

    unmount();

    expect(removeEventSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );
  });

  it("does not send PATCH when sessionId is empty", async () => {
    const { result } = renderHook(() =>
      useSessionLifecycle("", "test-token", null),
    );

    await act(async () => {
      await result.current.endSession();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ignores non-session_ended WebSocket messages", () => {
    const listeners: Record<string, (e: MessageEvent) => void> = {};
    const mockWs = {
      readyState: WebSocket.OPEN,
      send: vi.fn(),
      addEventListener: vi.fn((event: string, handler: (e: MessageEvent) => void) => {
        listeners[event] = handler;
      }),
      removeEventListener: vi.fn(),
    } as unknown as WebSocket;

    const { result } = renderHook(() =>
      useSessionLifecycle("session-123", "test-token", mockWs),
    );

    act(() => {
      listeners["message"]?.(
        new MessageEvent("message", {
          data: JSON.stringify({ type: "heartbeat" }),
        }),
      );
    });

    expect(result.current.sessionEnded).toBe(false);
  });
});
