import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNudgeQueue } from "./useNudgeQueue";
import type { NudgeData } from "../shared/types";

describe("useNudgeQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeNudge(overrides: Partial<NudgeData> = {}): NudgeData {
    return {
      nudge_type: "student_silent",
      message: "Check for understanding",
      priority: "medium",
      ...overrides,
    };
  }

  it("starts with no active nudge and empty queue", () => {
    const { result } = renderHook(() => useNudgeQueue());
    expect(result.current.activeNudge).toBeNull();
    expect(result.current.queueLength).toBe(0);
  });

  it("shows nudge immediately when queue is empty", () => {
    const { result } = renderHook(() => useNudgeQueue());
    act(() => {
      result.current.enqueue(makeNudge());
    });
    expect(result.current.activeNudge).not.toBeNull();
    expect(result.current.activeNudge!.message).toBe("Check for understanding");
  });

  it("auto-dismisses active nudge after 8 seconds", () => {
    const { result } = renderHook(() => useNudgeQueue());
    act(() => {
      result.current.enqueue(makeNudge());
    });
    expect(result.current.activeNudge).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(result.current.activeNudge).toBeNull();
  });

  it("queues second nudge while first is visible", () => {
    const { result } = renderHook(() => useNudgeQueue());
    act(() => {
      result.current.enqueue(makeNudge({ message: "First" }));
    });
    act(() => {
      result.current.enqueue(makeNudge({ message: "Second" }));
    });
    expect(result.current.activeNudge!.message).toBe("First");
    expect(result.current.queueLength).toBe(1);
  });

  it("shows queued nudge after current one dismisses", () => {
    const { result } = renderHook(() => useNudgeQueue());
    act(() => {
      result.current.enqueue(makeNudge({ message: "First" }));
    });
    act(() => {
      result.current.enqueue(makeNudge({ message: "Second" }));
    });

    // Dismiss first
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(result.current.activeNudge!.message).toBe("Second");
  });

  it("allows manual dismissal via dismiss()", () => {
    const { result } = renderHook(() => useNudgeQueue());
    act(() => {
      result.current.enqueue(makeNudge());
    });
    expect(result.current.activeNudge).not.toBeNull();

    act(() => {
      result.current.dismiss();
    });
    expect(result.current.activeNudge).toBeNull();
  });

  it("shows next queued nudge after manual dismiss", () => {
    const { result } = renderHook(() => useNudgeQueue());
    act(() => {
      result.current.enqueue(makeNudge({ message: "First" }));
    });
    act(() => {
      result.current.enqueue(makeNudge({ message: "Second" }));
    });

    act(() => {
      result.current.dismiss();
    });
    expect(result.current.activeNudge!.message).toBe("Second");
  });

  it("clears auto-dismiss timer on manual dismiss", () => {
    const { result } = renderHook(() => useNudgeQueue());
    act(() => {
      result.current.enqueue(makeNudge({ message: "First" }));
    });
    act(() => {
      result.current.enqueue(makeNudge({ message: "Second" }));
    });

    // Dismiss first manually at t=3s
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.activeNudge!.message).toBe("Second");

    // Second should auto-dismiss 8s after it appeared, not 5s
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.activeNudge).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.activeNudge).toBeNull();
  });

  it("handles multiple queued nudges in order", () => {
    const { result } = renderHook(() => useNudgeQueue());
    act(() => {
      result.current.enqueue(makeNudge({ message: "A" }));
    });
    act(() => {
      result.current.enqueue(makeNudge({ message: "B" }));
    });
    act(() => {
      result.current.enqueue(makeNudge({ message: "C" }));
    });

    expect(result.current.activeNudge!.message).toBe("A");
    expect(result.current.queueLength).toBe(2);

    act(() => vi.advanceTimersByTime(8000));
    expect(result.current.activeNudge!.message).toBe("B");
    expect(result.current.queueLength).toBe(1);

    act(() => vi.advanceTimersByTime(8000));
    expect(result.current.activeNudge!.message).toBe("C");
    expect(result.current.queueLength).toBe(0);

    act(() => vi.advanceTimersByTime(8000));
    expect(result.current.activeNudge).toBeNull();
  });
});
