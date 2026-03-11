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
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div
          className="w-full max-w-md p-8"
          data-testid="student-consent"
        >
          <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">
            Before You Join
          </h1>
          <p className="text-sm text-gray-500 mb-6 text-center">
            This session uses engagement analytics. Please review:
          </p>

          <div className="space-y-3 text-sm text-gray-700">
            <div className="rounded-lg bg-blue-50 p-4 space-y-2">
              <h3 className="font-semibold text-blue-900">
                What is analyzed during the session
              </h3>
              <ul className="list-disc pl-5 space-y-1 text-blue-800">
                <li>Eye contact (are you looking at the screen?)</li>
                <li>Facial energy (expression intensity)</li>
                <li>Voice activity (speaking vs. silence)</li>
                <li>Talk time balance between you and your tutor</li>
              </ul>
            </div>

            <div className="rounded-lg bg-green-50 p-4 space-y-2">
              <h3 className="font-semibold text-green-900">
                Your privacy is protected
              </h3>
              <ul className="list-disc pl-5 space-y-1 text-green-800">
                <li>
                  <strong>No video or audio is recorded</strong> &mdash; all
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

            <p className="text-xs text-gray-500">
              Analytics results are visible only to your tutor and are used
              to improve the tutoring experience.
            </p>
          </div>

          <div className="mt-5 border-t pt-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300"
                data-testid="student-consent-checkbox"
              />
              <span className="text-sm text-gray-700">
                I understand that this session analyzes engagement metrics and
                consent to participate.
              </span>
            </label>
          </div>

          {error && (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <div className="mt-4 flex gap-3">
            <button
              onClick={() => {
                setStep("form");
                setConsentChecked(false);
              }}
              className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              disabled={submitting}
            >
              Back
            </button>
            <button
              onClick={handleJoin}
              disabled={!consentChecked || submitting}
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
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
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          Join Session
        </h1>

        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="join-code"
              className="block text-sm font-medium text-gray-700 mb-1"
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
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={submitting}
            />
          </div>

          <div>
            <label
              htmlFor="display-name"
              className="block text-sm font-medium text-gray-700 mb-1"
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
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={submitting}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
