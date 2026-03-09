import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NudgeToast } from "./NudgeToast";
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
});
