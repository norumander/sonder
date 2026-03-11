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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <div
        className="mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl glass-panel p-6 shadow-2xl shadow-brand-purple/20"
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-title"
        data-testid="privacy-consent-modal"
      >
        <h2
          id="privacy-title"
          className="text-2xl font-bold text-white mb-4 text-glow"
        >
          Privacy &amp; Data Usage
        </h2>

        <div className="space-y-4 text-sm text-slate-300">
          <p>
            Sonder analyzes engagement during tutoring sessions. Before you
            begin, please review how data is handled:
          </p>

          <div className="rounded-xl bg-brand-teal/10 border border-brand-teal/20 p-4 space-y-2">
            <h3 className="font-semibold text-brand-teal">What we analyze</h3>
            <ul className="list-disc pl-5 space-y-1 text-slate-300">
              <li>Eye contact score (from webcam via on-device face mesh)</li>
              <li>Facial energy level (expression intensity)</li>
              <li>Voice activity (speech vs. silence &mdash; no transcription)</li>
              <li>Talk time balance and interruption patterns</li>
            </ul>
          </div>

          <div className="rounded-xl bg-brand-purple/10 border border-brand-purple/20 p-4 space-y-2">
            <h3 className="font-semibold text-brand-purple">
              What we never collect
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-slate-300">
              <li>Raw video or audio recordings</li>
              <li>Photos, screenshots, or face images</li>
              <li>Speech transcripts or conversation content</li>
              <li>Student real names or persistent identity</li>
            </ul>
          </div>

          <p>
            All face analysis runs <strong className="text-white">locally in your browser</strong> using
            MediaPipe Face Mesh. Only computed metric scores (small numbers) are
            sent to the server. Raw video and audio never leave your device.
          </p>

          <p>
            Session metrics are stored for trend analysis and post-session
            review. Students join anonymously and can leave at any time.
          </p>
        </div>

        <div className="mt-6 border-t border-slate-700/50 pt-5">
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-800 text-brand-purple focus:ring-brand-purple/50"
              data-testid="privacy-checkbox"
            />
            <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
              I understand how Sonder processes engagement data and consent to
              its use during my tutoring sessions.
            </span>
          </label>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-500" role="alert">
            {error}
          </p>
        )}

        <button
          onClick={handleAccept}
          disabled={!checked || submitting}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-brand-purple to-brand-teal px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-purple/20 hover:shadow-brand-purple/40 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          data-testid="privacy-accept-button"
        >
          {submitting ? "Saving..." : "I Agree & Continue"}
        </button>
      </div>
    </div>
  );
}
