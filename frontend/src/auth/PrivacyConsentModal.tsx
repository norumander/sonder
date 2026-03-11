/**
 * One-time privacy consent modal shown to tutors on first login.
 * Must be accepted before using the app.
 */

import { useState } from "react";

interface PrivacyConsentModalProps {
  onAccept: () => Promise<void>;
}

export function PrivacyConsentModal({ onAccept }: PrivacyConsentModalProps) {
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setSubmitting(true);
    setError(null);
    try {
      await onAccept();
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-title"
        data-testid="privacy-consent-modal"
      >
        <h2
          id="privacy-title"
          className="text-xl font-bold text-gray-900 mb-4"
        >
          Privacy &amp; Data Usage
        </h2>

        <div className="space-y-3 text-sm text-gray-700">
          <p>
            Sonder analyzes engagement during tutoring sessions. Before you
            begin, please review how data is handled:
          </p>

          <div className="rounded-lg bg-blue-50 p-4 space-y-2">
            <h3 className="font-semibold text-blue-900">What we analyze</h3>
            <ul className="list-disc pl-5 space-y-1 text-blue-800">
              <li>Eye contact score (from webcam via on-device face mesh)</li>
              <li>Facial energy level (expression intensity)</li>
              <li>Voice activity (speech vs. silence &mdash; no transcription)</li>
              <li>Talk time balance and interruption patterns</li>
            </ul>
          </div>

          <div className="rounded-lg bg-green-50 p-4 space-y-2">
            <h3 className="font-semibold text-green-900">
              What we never collect
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-green-800">
              <li>Raw video or audio recordings</li>
              <li>Photos, screenshots, or face images</li>
              <li>Speech transcripts or conversation content</li>
              <li>Student real names or persistent identity</li>
            </ul>
          </div>

          <p>
            All face analysis runs <strong>locally in your browser</strong> using
            MediaPipe Face Mesh. Only computed metric scores (small numbers) are
            sent to the server. Raw video and audio never leave your device.
          </p>

          <p>
            Session metrics are stored for trend analysis and post-session
            review. Students join anonymously and can leave at any time.
          </p>
        </div>

        <div className="mt-5 border-t pt-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300"
              data-testid="privacy-checkbox"
            />
            <span className="text-sm text-gray-700">
              I understand how Sonder processes engagement data and consent to
              its use during my tutoring sessions.
            </span>
          </label>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <button
          onClick={handleAccept}
          disabled={!checked || submitting}
          className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          data-testid="privacy-accept-button"
        >
          {submitting ? "Saving..." : "I Agree & Continue"}
        </button>
      </div>
    </div>
  );
}
