import { useState, useEffect } from "react";
import type { TrendDataPoint } from "./types";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

interface UseTrendsResult {
  sessions: TrendDataPoint[];
  loading: boolean;
  error: string | null;
}

/**
 * Hook to fetch cross-session trend data for the current tutor.
 *
 * @param token - JWT auth token. Fetch is skipped when empty.
 */
export function useTrends(token: string): UseTrendsResult {
  const [sessions, setSessions] = useState<TrendDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/tutor/trends`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load trends");
        return res.json();
      })
      .then((data: { sessions: TrendDataPoint[] }) => {
        if (!cancelled) {
          setSessions(data.sessions);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return { sessions, loading, error };
}
