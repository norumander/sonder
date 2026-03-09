import { useState, useEffect } from "react";
import type { NudgeType, NudgeThresholds, TutorPreferences } from "../shared/types";

/** All nudge types in display order. */
const NUDGE_TYPES: { type: NudgeType; label: string }[] = [
  { type: "student_silent", label: "Student Silent" },
  { type: "student_low_eye_contact", label: "Student Low Eye Contact" },
  { type: "tutor_dominant", label: "Tutor Dominant" },
  { type: "student_energy_drop", label: "Student Energy Drop" },
  { type: "interruption_spike", label: "Interruption Spike" },
  { type: "tutor_low_eye_contact", label: "Tutor Low Eye Contact" },
];

/** Threshold field metadata for rendering inputs. */
const THRESHOLD_FIELDS: {
  key: keyof NudgeThresholds;
  label: string;
  step: number;
  min: number;
  max: number;
}[] = [
  { key: "student_silent_minutes", label: "Silent duration (minutes)", step: 1, min: 1, max: 10 },
  { key: "eye_contact_low", label: "Eye contact threshold", step: 0.05, min: 0.1, max: 0.9 },
  { key: "eye_contact_duration_s", label: "Eye contact duration (seconds)", step: 5, min: 5, max: 120 },
  { key: "tutor_talk_pct", label: "Tutor talk percentage", step: 0.05, min: 0.5, max: 1.0 },
  { key: "tutor_talk_duration_minutes", label: "Tutor talk duration (minutes)", step: 1, min: 1, max: 15 },
  { key: "energy_drop_pct", label: "Energy drop percentage", step: 0.05, min: 0.1, max: 0.8 },
  { key: "interruption_count", label: "Interruption count", step: 1, min: 1, max: 10 },
  { key: "interruption_window_minutes", label: "Interruption window (minutes)", step: 0.5, min: 1, max: 5 },
];

interface NudgeSettingsProps {
  preferences: TutorPreferences;
  onSave: (prefs: TutorPreferences) => Promise<void>;
  saving: boolean;
}

/**
 * Settings panel for configuring nudge types and thresholds.
 */
export function NudgeSettings({ preferences, onSave, saving }: NudgeSettingsProps) {
  const [enabledNudges, setEnabledNudges] = useState<Set<NudgeType>>(
    new Set(preferences.enabled_nudges),
  );
  const [thresholds, setThresholds] = useState<NudgeThresholds>(
    preferences.nudge_thresholds,
  );

  // Sync local state when props change (e.g., after save returns updated data)
  useEffect(() => {
    setEnabledNudges(new Set(preferences.enabled_nudges));
    setThresholds(preferences.nudge_thresholds);
  }, [preferences]);

  function handleToggle(nudgeType: NudgeType) {
    setEnabledNudges((prev) => {
      const next = new Set(prev);
      if (next.has(nudgeType)) {
        next.delete(nudgeType);
      } else {
        next.add(nudgeType);
      }
      return next;
    });
  }

  function handleThresholdChange(key: keyof NudgeThresholds, value: string) {
    const num = Number(value);
    if (!Number.isNaN(num)) {
      setThresholds((prev) => ({ ...prev, [key]: num }));
    }
  }

  function handleSave() {
    onSave({
      enabled_nudges: Array.from(enabledNudges),
      nudge_thresholds: thresholds,
    });
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-xl font-semibold mb-6">Nudge Settings</h2>

      <section className="mb-8">
        <h3 className="text-lg font-medium mb-4">Enabled Nudge Types</h3>
        <div className="space-y-3">
          {NUDGE_TYPES.map(({ type, label }) => (
            <label key={type} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={enabledNudges.has(type)}
                onChange={() => handleToggle(type)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h3 className="text-lg font-medium mb-4">Thresholds</h3>
        <div className="space-y-4">
          {THRESHOLD_FIELDS.map(({ key, label, step, min, max }) => (
            <div key={key} className="flex items-center gap-4">
              <label htmlFor={key} className="text-sm text-gray-700 w-60">
                {label}
              </label>
              <input
                id={key}
                type="number"
                value={thresholds[key]}
                onChange={(e) => handleThresholdChange(key, e.target.value)}
                step={step}
                min={min}
                max={max}
                className="w-24 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>
      </section>

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}
