import { useState, useEffect, useCallback, useRef } from "react";
import { API_BASE } from "../shared/config";

interface UseSessionLifecycleResult {
  sessionEnded: boolean;
  endReason: string | null;
  endSession: () => Promise<void>;
}

/**
 * Hook managing session lifecycle: ending sessions, beforeunload cleanup,
 * and listening for session_ended WebSocket messages.
 *
 * @param sessionId - Current session ID
 * @param token - JWT auth token for PATCH request
 * @param ws - WebSocket connection (nullable)
 */
export function useSessionLifecycle(
  sessionId: string,
  token: string,
  ws: WebSocket | null,
): UseSessionLifecycleResult {
  const [sessionEnded, setSessionEnded] = useState(false);
  const [endReason, setEndReason] = useState<string | null>(null);
  const sessionIdRef = useRef(sessionId);
  const tokenRef = useRef(token);
  const wsRef = useRef(ws);

  sessionIdRef.current = sessionId;
  tokenRef.current = token;
  wsRef.current = ws;

  const endSession = useCallback(async () => {
    if (!sessionIdRef.current) return;

    // Send end_session via WebSocket for real-time broadcast
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "end_session" }));
    }

    // Also call REST API to persist status change
    try {
      await fetch(`${API_BASE}/sessions/${sessionIdRef.current}/end`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });
    } catch {
      // Network failure is acceptable — the WS end_session message
      // already triggered the server-side session end.
    }

    setSessionEnded(true);
    setEndReason("tutor_ended");
  }, []);

  // Listen for session_ended WebSocket messages
  useEffect(() => {
    if (!ws) return;

    function handleMessage(event: MessageEvent) {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "session_ended") {
          setSessionEnded(true);
          setEndReason(msg.data?.reason ?? null);
        }
      } catch {
        // Ignore non-JSON messages
      }
    }

    ws.addEventListener("message", handleMessage);
    return () => ws.removeEventListener("message", handleMessage);
  }, [ws]);

  // Register beforeunload handler to end session on tab close
  useEffect(() => {
    function handleBeforeUnload() {
      // Send end_session via WebSocket — this is the most reliable way
      // to notify the server during page unload. sendBeacon cannot send
      // PATCH requests or auth headers.
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
