import { useEffect, useState } from "react";

/**
 * Hook that tracks whether a WebSocket connection is open.
 *
 * Listens for open/close/error events and returns a reactive boolean.
 *
 * @param ws The WebSocket connection, or null if not connected.
 */
export function useWebSocketReady(ws: WebSocket | null): boolean {
  const [isReady, setIsReady] = useState(
    () => ws !== null && ws.readyState === WebSocket.OPEN,
  );

  useEffect(() => {
    if (!ws) {
      setIsReady(false);
      return;
    }

    const handleOpen = () => setIsReady(true);
    const handleClose = () => setIsReady(false);

    setIsReady(ws.readyState === WebSocket.OPEN);

    ws.addEventListener("open", handleOpen);
    ws.addEventListener("close", handleClose);
    ws.addEventListener("error", handleClose);
    return () => {
      ws.removeEventListener("open", handleOpen);
      ws.removeEventListener("close", handleClose);
      ws.removeEventListener("error", handleClose);
    };
  }, [ws]);

  return isReady;
}
