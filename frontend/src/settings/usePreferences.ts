import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "../shared/config";
import type { TutorPreferences } from "../shared/types";

interface UsePreferencesResult {
  preferences: TutorPreferences | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  save: (prefs: TutorPreferences) => Promise<void>;
}

/**
 * Hook to fetch and update tutor nudge preferences via REST API.
 *
 * @param token - JWT auth token. Fetch is skipped when empty.
 */
export function usePreferences(token: string): UsePreferencesResult {
  const [preferences, setPreferences] = useState<TutorPreferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/tutor/preferences`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load preferences");
        return res.json();
      })
      .then((data: TutorPreferences) => {
        if (!cancelled) setPreferences(data);
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

  const save = useCallback(
    async (prefs: TutorPreferences) => {
      setSaving(true);
      setError(null);

      try {
        const res = await fetch(`${API_BASE}/tutor/preferences`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(prefs),
        });

        if (!res.ok) throw new Error("Failed to save preferences");

        const saved: TutorPreferences = await res.json();
        setPreferences(saved);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [token],
  );

  return { preferences, loading, saving, error, save };
}
