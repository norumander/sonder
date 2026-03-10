import { useState, useEffect } from "react";

interface UseSessionEndedResult {
  sessionEnded: boolean;
  endReason: string | null;
}

/**
 * Shared hook that listens for session_ended WebSocket messages.
 *
 * Used by both student and tutor to detect when a session has ended
 * (e.g. tutor clicked "End Session" or student disconnect timeout).
 * Contains no role-specific logic.
 */
export function useSessionEnded(ws: WebSocket | null): UseSessionEndedResult {
  const [sessionEnded, setSessionEnded] = useState(false);
  const [endReason, setEndReason] = useState<string | null>(null);

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

  return { sessionEnded, endReason };
}
