import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "../shared/config";
import type { SessionListItem } from "./types";

interface UseSessionListResult {
  sessions: SessionListItem[];
  total: number;
  loading: boolean;
  error: string | null;
  page: number;
  setPage: (page: number) => void;
}

const PAGE_SIZE = 10;

/**
 * Hook to fetch paginated session list for the current tutor.
 *
 * @param token - JWT auth token. Fetch is skipped when empty.
 */
export function useSessionList(token: string): UseSessionListResult {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPageState] = useState(0);

  const setPage = useCallback((p: number) => {
    setPageState(p);
  }, []);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const offset = page * PAGE_SIZE;
    fetch(`${API_BASE}/sessions?limit=${PAGE_SIZE}&offset=${offset}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load sessions");
        return res.json();
      })
      .then((data: { sessions: SessionListItem[]; total: number }) => {
        if (!cancelled) {
          setSessions(data.sessions);
          setTotal(data.total);
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
  }, [token, page]);

  return { sessions, total, loading, error, page, setPage };
}

export { PAGE_SIZE };
