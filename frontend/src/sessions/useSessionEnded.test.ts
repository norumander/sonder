import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionEnded } from "./useSessionEnded";

describe("useSessionEnded", () => {
  it("starts with sessionEnded=false", () => {
    const { result } = renderHook(() => useSessionEnded(null));

    expect(result.current.sessionEnded).toBe(false);
    expect(result.current.endReason).toBeNull();
  });

  it("sets sessionEnded when session_ended WS message received", () => {
    const listeners: Record<string, (e: MessageEvent) => void> = {};
    const mockWs = {
      addEventListener: vi.fn((event: string, handler: (e: MessageEvent) => void) => {
        listeners[event] = handler;
      }),
      removeEventListener: vi.fn(),
    } as unknown as WebSocket;

    const { result } = renderHook(() => useSessionEnded(mockWs));

    expect(result.current.sessionEnded).toBe(false);

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

  it("ignores non-session_ended WebSocket messages", () => {
    const listeners: Record<string, (e: MessageEvent) => void> = {};
    const mockWs = {
      addEventListener: vi.fn((event: string, handler: (e: MessageEvent) => void) => {
        listeners[event] = handler;
      }),
      removeEventListener: vi.fn(),
    } as unknown as WebSocket;

    const { result } = renderHook(() => useSessionEnded(mockWs));

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
