import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useCreateSession } from "./useCreateSession";

describe("useCreateSession", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with no session, not creating, and no error", () => {
    const { result } = renderHook(() => useCreateSession("test-token"));
    expect(result.current.session).toBeNull();
    expect(result.current.creating).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("creates session and stores result on success", async () => {
    const mockSession = {
      session_id: "abc-123",
      join_code: "XYZ789",
      join_url: "/join/XYZ789",
      start_time: "2026-03-09T12:00:00Z",
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSession),
    } as Response);

    const { result } = renderHook(() => useCreateSession("test-token"));

    await act(async () => {
      await result.current.createSession("Algebra");
    });

    expect(result.current.session).toEqual(mockSession);
    expect(result.current.error).toBeNull();

    // Verify fetch was called correctly
    const [url, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/sessions");
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer test-token");
    expect(JSON.parse(options.body)).toEqual({ subject: "Algebra" });
  });

  it("sets error on API failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ detail: "Unauthorized" }),
    } as Response);

    const { result } = renderHook(() => useCreateSession("bad-token"));

    await act(async () => {
      await result.current.createSession();
    });

    expect(result.current.session).toBeNull();
    expect(result.current.error).toBe("Unauthorized");
  });

  it("sets error on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useCreateSession("test-token"));

    await act(async () => {
      await result.current.createSession();
    });

    expect(result.current.session).toBeNull();
    expect(result.current.error).toBe("Network error");
  });

  it("sends null subject when not provided", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          session_id: "x",
          join_code: "ABC123",
          join_url: "/join/ABC123",
          start_time: "2026-03-09T12:00:00Z",
        }),
    } as Response);

    const { result } = renderHook(() => useCreateSession("test-token"));

    await act(async () => {
      await result.current.createSession();
    });

    const body = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(body.subject).toBeNull();
  });
});
