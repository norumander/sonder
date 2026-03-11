import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NudgeToast, formatSessionTime } from "./NudgeToast";
import type { NudgeData } from "../shared/types";

describe("NudgeToast", () => {
  function makeNudge(overrides: Partial<NudgeData> = {}): NudgeData {
    return {
      nudge_type: "student_silent",
      message: "Check for understanding",
      priority: "medium",
      ...overrides,
    };
  }

  it("renders nudge message text", () => {
    render(<NudgeToast nudge={makeNudge()} onDismiss={() => {}} />);
    expect(screen.getByText("Check for understanding")).toBeTruthy();
  });

  it("calls onDismiss when close button clicked", () => {
    const onDismiss = vi.fn();
    render(<NudgeToast nudge={makeNudge()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("applies high priority styling", () => {
    render(<NudgeToast nudge={makeNudge({ priority: "high" })} onDismiss={() => {}} />);
    const toast = screen.getByTestId("nudge-toast");
    expect(toast.className).toContain("border-red");
  });

  it("applies medium priority styling", () => {
    render(<NudgeToast nudge={makeNudge({ priority: "medium" })} onDismiss={() => {}} />);
    const toast = screen.getByTestId("nudge-toast");
    expect(toast.className).toContain("border-yellow");
  });

  it("applies low priority styling", () => {
    render(<NudgeToast nudge={makeNudge({ priority: "low" })} onDismiss={() => {}} />);
    const toast = screen.getByTestId("nudge-toast");
    expect(toast.className).toContain("border-blue");
  });

  it("displays a coaching label", () => {
    render(<NudgeToast nudge={makeNudge()} onDismiss={() => {}} />);
    expect(screen.getByText(/coaching/i)).toBeTruthy();
  });

  it("displays session-relative timestamp when provided", () => {
    // 5 minutes 30 seconds = 330_000 ms
    render(<NudgeToast nudge={makeNudge()} timestampMs={330_000} onDismiss={() => {}} />);
    expect(screen.getByTestId("nudge-timestamp").textContent).toBe("00:05:30");
  });

  it("does not display timestamp when not provided", () => {
    render(<NudgeToast nudge={makeNudge()} onDismiss={() => {}} />);
    expect(screen.queryByTestId("nudge-timestamp")).toBeNull();
  });
});

describe("formatSessionTime", () => {
  it("formats zero ms as 00:00:00", () => {
    expect(formatSessionTime(0)).toBe("00:00:00");
  });

  it("formats seconds only", () => {
    expect(formatSessionTime(45_000)).toBe("00:00:45");
  });

  it("formats minutes and seconds", () => {
    expect(formatSessionTime(330_000)).toBe("00:05:30");
  });

  it("formats hours, minutes, and seconds", () => {
    expect(formatSessionTime(3_723_000)).toBe("01:02:03");
  });
});
