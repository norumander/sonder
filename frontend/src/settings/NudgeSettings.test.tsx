import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NudgeSettings } from "./NudgeSettings";
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

describe("NudgeSettings", () => {
  let onSave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSave = vi.fn().mockResolvedValue(undefined);
  });

  it("renders all 6 nudge types with toggles", () => {
    render(
      <NudgeSettings preferences={DEFAULT_PREFS} onSave={onSave} saving={false} />,
    );

    const toggles = screen.getAllByRole("checkbox");
    expect(toggles).toHaveLength(6);

    // All should be checked by default
    toggles.forEach((toggle) => {
      expect(toggle).toBeChecked();
    });
  });

  it("renders nudge type labels", () => {
    render(
      <NudgeSettings preferences={DEFAULT_PREFS} onSave={onSave} saving={false} />,
    );

    expect(screen.getByText("Student Silent")).toBeInTheDocument();
    expect(screen.getByText("Student Low Eye Contact")).toBeInTheDocument();
    expect(screen.getByText("Tutor Dominant")).toBeInTheDocument();
    expect(screen.getByText("Student Energy Drop")).toBeInTheDocument();
    expect(screen.getByText("Interruption Spike")).toBeInTheDocument();
    expect(screen.getByText("Tutor Low Eye Contact")).toBeInTheDocument();
  });

  it("renders threshold inputs with default values", () => {
    render(
      <NudgeSettings preferences={DEFAULT_PREFS} onSave={onSave} saving={false} />,
    );

    const silentInput = screen.getByLabelText("Silent duration (minutes)");
    expect(silentInput).toHaveValue(3);

    const eyeContactInput = screen.getByLabelText("Eye contact threshold");
    expect(eyeContactInput).toHaveValue(0.3);
  });

  it("disabling a nudge type calls onSave with updated enabled list", async () => {
    render(
      <NudgeSettings preferences={DEFAULT_PREFS} onSave={onSave} saving={false} />,
    );

    const studentSilentToggle = screen.getAllByRole("checkbox")[0];
    fireEvent.click(studentSilentToggle);

    // Click save
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled_nudges: expect.not.arrayContaining(["student_silent"]),
        }),
      );
    });
  });

  it("changing a threshold and saving sends updated thresholds", async () => {
    render(
      <NudgeSettings preferences={DEFAULT_PREFS} onSave={onSave} saving={false} />,
    );

    const silentInput = screen.getByLabelText("Silent duration (minutes)");
    fireEvent.change(silentInput, { target: { value: "5" } });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          nudge_thresholds: expect.objectContaining({
            student_silent_minutes: 5,
          }),
        }),
      );
    });
  });

  it("shows disabled state when saving is true", () => {
    render(
      <NudgeSettings preferences={DEFAULT_PREFS} onSave={onSave} saving={true} />,
    );

    const saveButton = screen.getByRole("button", { name: /saving/i });
    expect(saveButton).toBeDisabled();
  });

  it("reflects partially enabled nudges from preferences", () => {
    const prefs: TutorPreferences = {
      ...DEFAULT_PREFS,
      enabled_nudges: ["student_silent", "tutor_dominant"],
    };

    render(
      <NudgeSettings preferences={prefs} onSave={onSave} saving={false} />,
    );

    const toggles = screen.getAllByRole("checkbox");
    // student_silent (0) and tutor_dominant (2) checked, rest unchecked
    expect(toggles[0]).toBeChecked();
    expect(toggles[1]).not.toBeChecked();
    expect(toggles[2]).toBeChecked();
    expect(toggles[3]).not.toBeChecked();
    expect(toggles[4]).not.toBeChecked();
    expect(toggles[5]).not.toBeChecked();
  });

  it("re-enabling a nudge type adds it back to enabled list", async () => {
    const prefs: TutorPreferences = {
      ...DEFAULT_PREFS,
      enabled_nudges: ["student_silent"],
    };

    render(
      <NudgeSettings preferences={prefs} onSave={onSave} saving={false} />,
    );

    // Enable tutor_dominant (index 2)
    const toggles = screen.getAllByRole("checkbox");
    fireEvent.click(toggles[2]);

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled_nudges: expect.arrayContaining([
            "student_silent",
            "tutor_dominant",
          ]),
        }),
      );
    });
  });
});
