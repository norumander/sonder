/**
 * Page for creating a new tutoring session.
 * Shows a form with an optional subject field, then displays the join code
 * and a link to share with the student.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { useCreateSession } from "./useCreateSession";

export function CreateSessionPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { createSession, session, creating, error } = useCreateSession(token!);
  const [subject, setSubject] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createSession(subject.trim() || undefined);
  }

  if (session) {
    const joinLink = `${window.location.origin}/join/${session.join_code}`;

    return (
      <div className="mx-auto max-w-lg p-8">
        <h2 className="text-2xl font-bold text-white mb-6">Session Created</h2>
        <div className="glass-panel p-6 space-y-6">
          <div>
            <p className="text-sm text-slate-400 mb-1">Join Code</p>
            <p
              className="text-4xl font-mono font-bold tracking-widest text-brand-teal text-glow"
              data-testid="join-code"
            >
              {session.join_code}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-400 mb-2">Share Link</p>
            <div className="flex items-center gap-3">
              <code className="flex-1 rounded-lg bg-slate-900/80 border border-slate-700 px-4 py-3 text-sm text-slate-300 break-all font-mono">
                {joinLink}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(joinLink)}
                className="rounded-lg bg-brand-purple/20 border border-brand-purple/50 px-4 py-3 text-sm font-medium text-brand-purple hover:bg-brand-purple hover:text-white transition-colors"
                type="button"
              >
                Copy
              </button>
            </div>
          </div>

          <p className="text-sm text-slate-400 text-center animate-pulse">
            Waiting for student to join...
          </p>

          <button
            onClick={() => navigate(`/session/${session.session_id}`)}
            className="w-full rounded-xl bg-gradient-to-r from-brand-teal to-brand-purple px-4 py-3 text-base font-semibold text-white shadow-lg shadow-brand-purple/20 hover:shadow-brand-purple/40 hover:opacity-90 transition-all"
          >
            Start Session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg p-8 mt-10">
      <h2 className="text-2xl font-bold text-white mb-6">New Session</h2>

      <form onSubmit={handleSubmit} className="glass-panel p-8 space-y-6">
        <div>
          <label
            htmlFor="subject"
            className="block text-sm font-medium text-slate-300 mb-2"
          >
            Subject (optional)
          </label>
          <input
            id="subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Algebra, SAT Prep"
            className="w-full rounded-lg bg-slate-900/80 border border-slate-700 px-4 py-3 text-white placeholder-slate-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal transition-colors"
            disabled={creating}
          />
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-900/30 p-3 rounded border border-red-500/20" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={creating}
          className="w-full rounded-xl bg-slate-800 border border-slate-600 px-4 py-3 text-base font-medium text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {creating ? "Creating..." : "Create Session"}
        </button>
      </form>
    </div>
  );
}
