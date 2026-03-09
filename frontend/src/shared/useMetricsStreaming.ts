import { useEffect, useRef, useMemo } from "react";

const METRICS_INTERVAL_MS = 500;

export interface MetricsStreamingState {
  /** Whether the WebSocket is open and metrics are being streamed. */
  isStreaming: boolean;
}

/**
 * Hook that streams client-side face metrics (eye contact, facial energy)
 * to the server via WebSocket at 500ms intervals.
 *
 * Sends `{ type: "client_metrics", data: { eye_contact_score, facial_energy }, timestamp }`.
 * Null values are sent when face is not detected.
 *
 * @param ws The WebSocket connection, or null if not connected.
 * @param eyeContactScore Current eye contact score (0.0–1.0) or null.
 * @param facialEnergy Current facial energy score (0.0–1.0) or null.
 */
export function useMetricsStreaming(
  ws: WebSocket | null,
  eyeContactScore: number | null,
  facialEnergy: number | null,
): MetricsStreamingState {
  const isStreaming = useMemo(
    () => ws !== null && ws.readyState === WebSocket.OPEN,
    [ws],
  );

  // Use refs so the interval callback always sees the latest values
  // without needing to restart the interval on every metric change.
  const eyeContactRef = useRef(eyeContactScore);
  const facialEnergyRef = useRef(facialEnergy);
  const wsRef = useRef(ws);

  eyeContactRef.current = eyeContactScore;
  facialEnergyRef.current = facialEnergy;
  wsRef.current = ws;

  useEffect(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const intervalId = setInterval(() => {
      const currentWs = wsRef.current;
      if (!currentWs || currentWs.readyState !== WebSocket.OPEN) return;

      currentWs.send(
        JSON.stringify({
          type: "client_metrics",
          data: {
            eye_contact_score: eyeContactRef.current,
            facial_energy: facialEnergyRef.current,
          },
          timestamp: Date.now(),
        }),
      );
    }, METRICS_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [ws]);

  return { isStreaming };
}
