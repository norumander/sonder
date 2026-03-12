/**
 * Container that listens for nudge WebSocket messages and renders
 * toast notifications using a FIFO queue (max 1 visible at a time).
 */

import { useCallback, useEffect } from "react";
import type { NudgeData } from "../shared/types";
import { NudgeToast } from "./NudgeToast";
import { useNudgeQueue } from "./useNudgeQueue";

interface NudgeContainerProps {
  ws: WebSocket | null;
  /** Epoch ms when the session started, used to convert absolute timestamps to session-relative. */
  sessionStartMs?: number;
}

export function NudgeContainer({ ws, sessionStartMs }: NudgeContainerProps) {
  const { activeNudge, enqueue, dismiss } = useNudgeQueue();

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      let msg: { type: string; data?: unknown };
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      if (msg.type === "nudge") {
        const rawTs = (msg as { timestamp?: number }).timestamp ?? null;
        // Convert absolute epoch ms to session-relative ms
        const relativeTs = rawTs != null && sessionStartMs
          ? Math.max(0, rawTs - sessionStartMs)
          : null;
        enqueue(msg.data as NudgeData, relativeTs);
      }
    },
    [enqueue, sessionStartMs],
  );

  useEffect(() => {
    if (!ws) return;
    ws.addEventListener("message", handleMessage);
    return () => {
      ws.removeEventListener("message", handleMessage);
    };
  }, [ws, handleMessage]);

  if (!activeNudge) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80">
      <NudgeToast
        nudge={activeNudge.nudge}
        timestampMs={activeNudge.timestampMs}
        onDismiss={dismiss}
      />
    </div>
  );
}
