import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTutorSessionControl } from "./useTutorSessionControl";

describe("useTutorSessionControl", () => {
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
      useTutorSessionControl("session-123", "test-token", null),
    );

    expect(result.current.sessionEnded).toBe(false);
    expect(result.current.endReason).toBeNull();
  });

  it("endSession calls PATCH /sessions/{id}/end", async () => {
    const { result } = renderHook(() =>
      useTutorSessionControl("session-123", "test-token", null),
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
      useTutorSessionControl("session-123", "test-token", mockWs),
    );

    await act(async () => {
      await result.current.endSession();
    });

    expect(mockWs.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "end_session" }),
    );
  });

  it("registers beforeunload handler", () => {
    renderHook(() =>
      useTutorSessionControl("session-123", "test-token", null),
    );

    expect(addEventSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );
  });

  it("removes beforeunload handler on unmount", () => {
    const { unmount } = renderHook(() =>
      useTutorSessionControl("session-123", "test-token", null),
    );

    unmount();

    expect(removeEventSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );
  });

  it("does not send PATCH when sessionId is empty", async () => {
    const { result } = renderHook(() =>
      useTutorSessionControl("", "test-token", null),
    );

    await act(async () => {
      await result.current.endSession();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
