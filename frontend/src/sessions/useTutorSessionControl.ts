import { useCallback, useEffect, useRef } from "react";
import { API_BASE } from "../shared/config";
import { useSessionEnded } from "./useSessionEnded";

interface UseTutorSessionControlResult {
  sessionEnded: boolean;
  endReason: string | null;
  endSession: () => Promise<void>;
}

/**
 * Tutor-only hook for session lifecycle management.
 *
 * Provides:
 * - endSession(): sends end_session via WS + PATCH to persist
 * - beforeunload handler to end session on tab close
 * - session_ended message listener (via useSessionEnded)
 *
 * Students must NOT use this hook. Use useSessionEnded instead.
 */
export function useTutorSessionControl(
  sessionId: string,
  token: string,
  ws: WebSocket | null,
): UseTutorSessionControlResult {
  const { sessionEnded, endReason } = useSessionEnded(ws);
  const sessionIdRef = useRef(sessionId);
  const tokenRef = useRef(token);
  const wsRef = useRef(ws);

  sessionIdRef.current = sessionId;
  tokenRef.current = token;
  wsRef.current = ws;

  const endSession = useCallback(async () => {
    if (!sessionIdRef.current) return;

    // Send end_session via WebSocket for real-time broadcast.
    // The backend will broadcast session_ended to both participants,
    // which useSessionEnded will catch to update state.
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "end_session" }));
    }

    // Also call REST API to persist status change (fire-and-forget).
    // The WS end_session message already triggers server-side session end
    // and summary generation, so we don't await this redundant call.
    fetch(`${API_BASE}/sessions/${sessionIdRef.current}/end`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenRef.current}` },
    }).catch(() => {
      // Network failure is acceptable
    });
  }, []);

  // Register beforeunload handler to end session on tutor tab close
  useEffect(() => {
    function handleBeforeUnload() {
      const currentWs = wsRef.current;
      if (currentWs && currentWs.readyState === WebSocket.OPEN) {
        currentWs.send(JSON.stringify({ type: "end_session" }));
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return { sessionEnded, endReason, endSession };
}
