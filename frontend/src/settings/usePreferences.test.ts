import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePreferences } from "./usePreferences";
import type { TutorPreferences } from "../shared/types";

const DEFAULT_PREFS: TutorPreferences = {
  enabled_nudges: [
    "student_silent",
    "student_low_eye_contact",
    "tutor_dominant",
    "student_energy_drop",
    "interruption_spike",
    "tutor_low_eye_contact",
  ],
  nudge_thresholds: {
    student_silent_minutes: 3,
    eye_contact_low: 0.3,
    eye_contact_duration_s: 30,
    tutor_talk_pct: 0.8,
    tutor_talk_duration_minutes: 5,
    energy_drop_pct: 0.3,
    interruption_count: 3,
    interruption_window_minutes: 2,
  },
};

describe("usePreferences", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches preferences on mount and exposes them", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(DEFAULT_PREFS),
    } as Response);

    const { result } = renderHook(() => usePreferences("test-token"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.preferences).toEqual(DEFAULT_PREFS);
    expect(result.current.error).toBeNull();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/tutor/preferences"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );
  });

  it("sets error when fetch fails", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    const { result } = renderHook(() => usePreferences("bad-token"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.preferences).toBeNull();
    expect(result.current.error).toBe("Failed to load preferences");
  });

  it("saves preferences via PUT and updates local state", async () => {
    // Initial GET
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(DEFAULT_PREFS),
    } as Response);

    const { result } = renderHook(() => usePreferences("test-token"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const updated: TutorPreferences = {
      ...DEFAULT_PREFS,
      enabled_nudges: ["student_silent", "tutor_dominant"],
    };

    // PUT response
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(updated),
    } as Response);

    await act(async () => {
      await result.current.save(updated);
    });

    expect(result.current.preferences).toEqual(updated);
    expect(fetchSpy).toHaveBeenLastCalledWith(
      expect.stringContaining("/tutor/preferences"),
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        }),
        body: JSON.stringify(updated),
      }),
    );
  });

  it("sets error when save fails", async () => {
    // Initial GET
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(DEFAULT_PREFS),
    } as Response);

    const { result } = renderHook(() => usePreferences("test-token"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // PUT fails
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    await act(async () => {
      await result.current.save(DEFAULT_PREFS);
    });

    expect(result.current.error).toBe("Failed to save preferences");
    // Original preferences unchanged
    expect(result.current.preferences).toEqual(DEFAULT_PREFS);
  });

  it("does not fetch when token is empty", () => {
    renderHook(() => usePreferences(""));

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("exposes saving state during PUT request", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(DEFAULT_PREFS),
    } as Response);

    const { result } = renderHook(() => usePreferences("test-token"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let resolvePromise: (v: Response) => void;
    fetchSpy.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolvePromise = resolve;
      }),
    );

    let savePromise: Promise<void>;
    act(() => {
      savePromise = result.current.save(DEFAULT_PREFS);
    });

    expect(result.current.saving).toBe(true);

    await act(async () => {
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve(DEFAULT_PREFS),
      } as Response);
      await savePromise;
    });

    expect(result.current.saving).toBe(false);
  });
});
