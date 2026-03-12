import { useState, useEffect } from "react";
import type { NudgeType, NudgeThresholds, TutorPreferences } from "../shared/types";

/** All nudge types in display order with descriptions and trigger source. */
const NUDGE_TYPES: {
  type: NudgeType;
  label: string;
  description: string;
  triggeredBy: "Student" | "Tutor";
}[] = [
  {
    type: "student_silent",
    label: "Student Silent",
    description: "Fires when the student hasn't spoken for a while — prompts you to check for understanding.",
    triggeredBy: "Student",
  },
  {
    type: "student_low_eye_contact",
    label: "Student Low Eye Contact",
    description: "Fires when the student looks away from the screen for too long — they may be distracted.",
    triggeredBy: "Student",
  },
  {
    type: "tutor_dominant",
    label: "Tutor Talking Too Much",
    description: "Fires when you've been talking most of the time — encourages asking questions instead.",
    triggeredBy: "Tutor",
  },
  {
    type: "student_energy_drop",
    label: "Student Energy Drop",
    description: "Fires when the student's facial energy drops noticeably — suggests a break or new approach.",
    triggeredBy: "Student",
  },
  {
    type: "interruption_spike",
    label: "Frequent Interruptions",
    description: "Fires when too many interruptions happen in a short window — suggests giving more wait time.",
    triggeredBy: "Student",
  },
  {
    type: "tutor_low_eye_contact",
    label: "Tutor Low Eye Contact",
    description: "Fires when your eye contact drops for too long — reminds you to look at the camera.",
    triggeredBy: "Tutor",
  },
];

/** Threshold field metadata for rendering inputs. */
const THRESHOLD_FIELDS: {
  key: keyof NudgeThresholds;
  label: string;
  hint: string;
  step: number;
  min: number;
  max: number;
}[] = [
  { key: "student_silent_minutes", label: "Student silent for (minutes)", hint: "How long the student must be quiet before nudging", step: 1, min: 1, max: 10 },
  { key: "eye_contact_low", label: "Eye contact minimum (0–1)", hint: "Score below this counts as low eye contact", step: 0.05, min: 0.1, max: 0.9 },
  { key: "eye_contact_duration_s", label: "Low eye contact for (seconds)", hint: "How long eye contact must stay low before nudging", step: 5, min: 5, max: 120 },
  { key: "tutor_talk_pct", label: "Tutor talk share (0–1)", hint: "Nudge fires when tutor exceeds this share of talking time", step: 0.05, min: 0.5, max: 1.0 },
  { key: "tutor_talk_duration_minutes", label: "Tutor dominant for (minutes)", hint: "How long the tutor must dominate before nudging", step: 1, min: 1, max: 15 },
  { key: "energy_drop_pct", label: "Energy drop size (0–1)", hint: "How much the student's energy must fall to trigger a nudge", step: 0.05, min: 0.1, max: 0.8 },
  { key: "interruption_count", label: "Interruptions needed", hint: "Number of interruptions within the window to trigger a nudge", step: 1, min: 1, max: 10 },
  { key: "interruption_window_minutes", label: "Interruption window (minutes)", hint: "Time window for counting interruptions", step: 0.5, min: 1, max: 5 },
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
    <div className="max-w-2xl mx-auto p-8 glass-panel rounded-2xl">
      <h2 className="text-2xl font-bold mb-8 text-white text-glow">Nudge Settings</h2>

      <section className="mb-10">
        <h3 className="text-lg font-bold mb-6 text-brand-teal uppercase tracking-wider">Enabled Nudge Types</h3>
        <div className="space-y-5">
          {NUDGE_TYPES.map(({ type, label, description, triggeredBy }) => (
            <label key={type} className="flex items-start gap-4 cursor-pointer group">
              <input
                type="checkbox"
                checked={enabledNudges.has(type)}
                onChange={() => handleToggle(type)}
                className="mt-1 h-5 w-5 shrink-0 rounded border-slate-600 bg-slate-800 text-brand-teal focus:ring-brand-teal/50 transition-colors"
                data-testid={`setting-${type}`}
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">{label}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      triggeredBy === "Student"
                        ? "bg-yellow-500/20 text-yellow-300"
                        : "bg-brand-purple/20 text-brand-purple"
                    }`}
                  >
                    {triggeredBy}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{description}</p>
              </div>
            </label>
          ))}
        </div>
      </section>

      <div className="h-px bg-slate-700/50 w-full mb-10" />

      <section className="mb-10">
        <h3 className="text-lg font-bold mb-6 text-brand-purple uppercase tracking-wider">Thresholds</h3>
        <div className="space-y-6">
          {THRESHOLD_FIELDS.map(({ key, label, hint, step, min, max }) => (
            <div key={key} className="flex items-center gap-6">
              <div className="w-64">
                <label htmlFor={key} className="text-sm font-medium text-slate-300">
                  {label}
                </label>
                <p className="text-xs text-slate-500 mt-0.5">{hint}</p>
              </div>
              <input
                id={key}
                type="number"
                value={thresholds[key]}
                onChange={(e) => handleThresholdChange(key, e.target.value)}
                step={step}
                min={min}
                max={max}
                className="w-28 rounded-xl border border-slate-600 bg-slate-900/50 px-3 py-2 text-sm text-white focus:border-brand-purple focus:ring-1 focus:ring-brand-purple transition-colors"
                data-testid={`threshold-${key}`}
              />
            </div>
          ))}
        </div>
      </section>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-brand-purple to-brand-teal text-white font-semibold rounded-xl shadow-lg shadow-brand-purple/20 hover:shadow-brand-purple/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02] active:scale-[0.98]"
        data-testid="save-settings"
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}
