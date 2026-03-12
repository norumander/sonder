import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NudgeToast, formatSessionTime, getTriggerSource } from "./NudgeToast";
import type { NudgeData } from "../shared/types";

describe("NudgeToast", () => {
  function makeNudge(overrides: Partial<NudgeData> = {}): NudgeData {
    return {
      nudge_type: "student_silent",
      message: "Student hasn't spoken — check for understanding",
      priority: "medium",
      ...overrides,
    };
  }

  it("renders nudge message text", () => {
    render(<NudgeToast nudge={makeNudge()} onDismiss={() => {}} />);
    expect(screen.getByText(/check for understanding/i)).toBeTruthy();
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
    expect(toast.className).toContain("border-brand-teal");
  });

  it("displays a coaching label", () => {
    render(<NudgeToast nudge={makeNudge()} onDismiss={() => {}} />);
    expect(screen.getByText(/coaching/i)).toBeTruthy();
  });

  it("shows Student source tag for student-triggered nudges", () => {
    render(<NudgeToast nudge={makeNudge({ nudge_type: "student_silent" })} onDismiss={() => {}} />);
    expect(screen.getByTestId("nudge-source").textContent).toBe("Student");
  });

  it("shows Tutor source tag for tutor-triggered nudges", () => {
    render(<NudgeToast nudge={makeNudge({ nudge_type: "tutor_dominant" })} onDismiss={() => {}} />);
    expect(screen.getByTestId("nudge-source").textContent).toBe("Tutor");
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

describe("getTriggerSource", () => {
  it("returns Student for student_ prefixed types", () => {
    expect(getTriggerSource("student_silent")).toBe("Student");
    expect(getTriggerSource("student_low_eye_contact")).toBe("Student");
    expect(getTriggerSource("student_energy_drop")).toBe("Student");
  });

  it("returns Tutor for tutor_ prefixed types", () => {
    expect(getTriggerSource("tutor_dominant")).toBe("Tutor");
    expect(getTriggerSource("tutor_low_eye_contact")).toBe("Tutor");
  });

  it("returns Student for interruption_spike", () => {
    expect(getTriggerSource("interruption_spike")).toBe("Student");
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
