import { useState, useEffect } from "react";
import { API_BASE } from "../shared/config";
import type { MetricSnapshotData, SessionNudge, SessionSummaryData } from "./types";

interface UseSessionDetailResult {
  summary: SessionSummaryData | null;
  snapshots: MetricSnapshotData[];
  nudges: SessionNudge[];
  loading: boolean;
  error: string | null;
}

/**
 * Hook to fetch session summary, metric snapshots, and nudges for a session.
 *
 * @param sessionId - Session UUID to fetch.
 * @param token - JWT auth token. Fetch is skipped when empty.
 */
export function useSessionDetail(
  sessionId: string,
  token: string,
): UseSessionDetailResult {
  const [summary, setSummary] = useState<SessionSummaryData | null>(null);
  const [snapshots, setSnapshots] = useState<MetricSnapshotData[]>([]);
  const [nudges, setNudges] = useState<SessionNudge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !sessionId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch(`${API_BASE}/sessions/${sessionId}/summary`, { headers }).then(
        (res) => {
          if (!res.ok) throw new Error("Failed to load summary");
          return res.json() as Promise<SessionSummaryData>;
        },
      ),
      fetch(`${API_BASE}/sessions/${sessionId}/snapshots`, { headers }).then(
        (res) => {
          if (!res.ok) throw new Error("Failed to load snapshots");
          return res.json() as Promise<{ snapshots: MetricSnapshotData[] }>;
        },
      ),
      fetch(`${API_BASE}/sessions/${sessionId}/nudges`, { headers }).then(
        (res) => {
          if (!res.ok) throw new Error("Failed to load nudges");
          return res.json() as Promise<{ nudges: SessionNudge[] }>;
        },
      ),
    ])
      .then(([summaryData, snapshotsData, nudgesData]) => {
        if (!cancelled) {
          setSummary(summaryData);
          setSnapshots(snapshotsData.snapshots);
          setNudges(nudgesData.nudges);
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
  }, [sessionId, token]);

  return { summary, snapshots, nudges, loading, error };
}
