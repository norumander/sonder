import { useState } from "react";
import { API_BASE } from "../shared/config";

interface StudentJoinPageProps {
  /** Called with session_id and participant_token after successful join. */
  onJoin: (sessionId: string, participantToken: string) => void;
  /** Optional pre-filled join code from URL parameter. */
  initialCode?: string;
}

/**
 * Join page for students. Two steps:
 * 1. Enter session code and display name.
 * 2. Review privacy disclosure and accept before joining.
 */
export function StudentJoinPage({ onJoin, initialCode }: StudentJoinPageProps) {
  const [joinCode, setJoinCode] = useState(initialCode ?? "");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Two-step flow: "form" → "consent"
  const [step, setStep] = useState<"form" | "consent">("form");
  const [consentChecked, setConsentChecked] = useState(false);

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedCode = joinCode.trim();
    const trimmedName = displayName.trim();

    if (!trimmedCode) {
      setError("Session code is required.");
      return;
    }

    if (!trimmedName) {
      setError("Display name is required.");
      return;
    }

    if (trimmedName.length > 50) {
      setError("Display name must be 50 characters or fewer.");
      return;
    }

    // Proceed to consent step
    setStep("consent");
  }

  async function handleJoin() {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/sessions/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          join_code: joinCode.trim(),
          display_name: displayName.trim(),
        }),
      });

      if (!response.ok) {
        try {
          const data = await response.json();
          setError(data.detail ?? "Failed to join session.");
        } catch {
          setError(`Failed to join session (${response.status}).`);
        }
        setSubmitting(false);
        setStep("form");
        return;
      }

      const data = await response.json();
      onJoin(data.session_id, data.participant_token);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
      setStep("form");
    }
  }

  if (step === "consent") {
    return (
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center p-4">
        <div
          className="w-full max-w-md p-8 glass-panel rounded-2xl"
          data-testid="student-consent"
        >
          <h1 className="text-2xl font-bold text-white mb-2 text-center text-glow">
            Before You Join
          </h1>
          <p className="text-sm text-slate-400 mb-6 text-center">
            This session uses engagement analytics. Please review:
          </p>

          <div className="space-y-4 text-sm text-slate-300">
            <div className="rounded-xl bg-brand-teal/10 border border-brand-teal/20 p-4 space-y-2">
              <h3 className="font-semibold text-brand-teal">
                What is analyzed during the session
              </h3>
              <ul className="list-disc pl-5 space-y-1 text-slate-300">
                <li>Eye contact (are you looking at the screen?)</li>
                <li>Facial energy (expression intensity)</li>
                <li>Voice activity (speaking vs. silence)</li>
                <li>Talk time balance between you and your tutor</li>
              </ul>
            </div>

            <div className="rounded-xl bg-brand-purple/10 border border-brand-purple/20 p-4 space-y-2">
              <h3 className="font-semibold text-brand-purple">
                Your privacy is protected
              </h3>
              <ul className="list-disc pl-5 space-y-1 text-slate-300">
                <li>
                  <strong className="text-white">No video or audio is recorded</strong> &mdash; all
                  analysis runs locally in your browser
                </li>
                <li>
                  Only numerical scores are sent to the server (e.g., &ldquo;eye
                  contact: 0.8&rdquo;)
                </li>
                <li>
                  Your identity is anonymous &mdash; only your chosen display
                  name is stored
                </li>
                <li>You can leave the session at any time</li>
              </ul>
            </div>

            <p className="text-xs text-slate-500 text-center">
              Analytics results are visible only to your tutor and are used
              to improve the tutoring experience.
            </p>
          </div>

          <div className="mt-6 border-t border-slate-700/50 pt-5">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-800 text-brand-teal focus:ring-brand-teal/50"
                data-testid="student-consent-checkbox"
              />
              <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
                I understand that this session analyzes engagement metrics and
                consent to participate.
              </span>
            </label>
          </div>

          {error && (
            <p className="mt-3 text-sm text-red-500" role="alert">
              {error}
            </p>
          )}

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => {
                setStep("form");
                setConsentChecked(false);
              }}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
              disabled={submitting}
            >
              Back
            </button>
            <button
              onClick={handleJoin}
              disabled={!consentChecked || submitting}
              className="flex-1 rounded-xl bg-gradient-to-r from-brand-teal to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-teal/20 hover:shadow-brand-teal/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="student-consent-join"
            >
              {submitting ? "Joining..." : "I Agree & Join"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center p-4">
      <div className="w-full max-w-sm p-8 glass-panel rounded-2xl">
        <h1 className="text-3xl font-bold text-white mb-6 text-center text-glow">
          Join Session
        </h1>

        <form onSubmit={handleFormSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="join-code"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Session Code
            </label>
            <input
              id="join-code"
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="e.g. ABC123"
              className="w-full rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-3 text-white placeholder-slate-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal transition-colors"
              disabled={submitting}
            />
          </div>

          <div>
            <label
              htmlFor="display-name"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Display Name
            </label>
            <input
              id="display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={50}
              placeholder="Your name"
              className="w-full rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-3 text-white placeholder-slate-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal transition-colors"
              disabled={submitting}
            />
          </div>

          {error && (
            <p className="text-sm text-red-500" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full rounded-xl bg-gradient-to-r from-brand-teal to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-teal/20 hover:shadow-brand-teal/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
