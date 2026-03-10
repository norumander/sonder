import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTrends } from "./useTrends";
import type { TrendDataPoint } from "./types";

function makeTrendPoint(overrides: Partial<TrendDataPoint> = {}): TrendDataPoint {
  return {
    session_id: "s-1",
    start_time: "2026-03-07T10:00:00+00:00",
    end_time: "2026-03-07T10:30:00+00:00",
    tutor_eye_contact: 0.8,
    student_eye_contact: 0.6,
    tutor_energy: 0.7,
    student_energy: 0.5,
    tutor_talk_pct: 55,
    student_talk_pct: 45,
    total_interruptions: 3,
    engagement_score: 75,
    ...overrides,
  };
}

describe("useTrends", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches trends and returns session data", async () => {
    const trendData = [makeTrendPoint(), makeTrendPoint({ session_id: "s-2", engagement_score: 85 })];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sessions: trendData }),
    });

    const { result } = renderHook(() => useTrends("test-token"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sessions).toHaveLength(2);
    expect(result.current.sessions[0].engagement_score).toBe(75);
    expect(result.current.sessions[1].engagement_score).toBe(85);
    expect(result.current.error).toBeNull();
  });

  it("sends auth header with token", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sessions: [] }),
    });

    renderHook(() => useTrends("my-jwt"));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/tutor/trends");
    expect(options.headers.Authorization).toBe("Bearer my-jwt");
  });

  it("skips fetch when token is empty", () => {
    renderHook(() => useTrends(""));

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sets error on fetch failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useTrends("test-token"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Failed to load trends");
    expect(result.current.sessions).toEqual([]);
  });

  it("sets error on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useTrends("test-token"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Network error");
  });

  it("returns loading true while fetching", () => {
    mockFetch.mockReturnValueOnce(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useTrends("test-token"));

    expect(result.current.loading).toBe(true);
  });
});
