/**
 * Hook for creating a new tutoring session via POST /sessions.
 */

import { useState, useCallback } from "react";
import { API_BASE } from "../shared/config";

interface SessionCreated {
  session_id: string;
  join_code: string;
  join_url: string;
  start_time: string;
}

interface UseCreateSessionResult {
  createSession: (subject?: string) => Promise<void>;
  session: SessionCreated | null;
  creating: boolean;
  error: string | null;
}

/**
 * Creates a new session via the backend API.
 *
 * @param token - JWT auth token for the request.
 */
export function useCreateSession(token: string): UseCreateSessionResult {
  const [session, setSession] = useState<SessionCreated | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createSession = useCallback(
    async (subject?: string) => {
      setError(null);
      setCreating(true);

      try {
        const response = await fetch(`${API_BASE}/sessions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ subject: subject || null }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          throw new Error(errData?.detail ?? `Failed to create session (${response.status})`);
        }

        const data: SessionCreated = await response.json();
        setSession(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      } finally {
        setCreating(false);
      }
    },
    [token],
  );

  return { createSession, session, creating, error };
}
