import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

interface StudentJoinPageProps {
  /** Called with session_id and participant_token after successful join. */
  onJoin: (sessionId: string, participantToken: string) => void;
}

/**
 * Join page for students. Prompts for a 6-character session code and display name.
 * Calls POST /sessions/join and invokes onJoin on success.
 */
export function StudentJoinPage({ onJoin }: StudentJoinPageProps) {
  const [joinCode, setJoinCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
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

    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE}/sessions/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          join_code: trimmedCode,
          display_name: trimmedName,
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
        return;
      }

      const data = await response.json();
      onJoin(data.session_id, data.participant_token);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          Join Session
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            {submitting ? "Joining..." : "Join Session"}
          </button>
        </form>
      </div>
    </div>
  );
}
