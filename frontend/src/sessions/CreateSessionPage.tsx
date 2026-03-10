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
        <h2 className="text-xl font-bold text-gray-900 mb-6">Session Created</h2>
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <div>
            <p className="text-sm text-gray-500 mb-1">Join Code</p>
            <p
              className="text-3xl font-mono font-bold tracking-widest text-blue-600"
              data-testid="join-code"
            >
              {session.join_code}
            </p>
          </div>

          <div>
            <p className="text-sm text-gray-500 mb-1">Share Link</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-gray-100 px-3 py-2 text-sm text-gray-700 break-all">
                {joinLink}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(joinLink)}
                className="rounded bg-gray-200 px-3 py-2 text-sm hover:bg-gray-300"
                type="button"
              >
                Copy
              </button>
            </div>
          </div>

          <p className="text-sm text-gray-500">
            Waiting for student to join...
          </p>

          <button
            onClick={() => navigate(`/session/${session.session_id}`)}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Start Session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg p-8">
      <h2 className="text-xl font-bold text-gray-900 mb-6">New Session</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="subject"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Subject (optional)
          </label>
          <input
            id="subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Algebra, SAT Prep"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            disabled={creating}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={creating}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed"
        >
          {creating ? "Creating..." : "Create Session"}
        </button>
      </form>
    </div>
  );
}
