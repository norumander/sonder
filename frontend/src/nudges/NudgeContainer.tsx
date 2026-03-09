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
}

export function NudgeContainer({ ws }: NudgeContainerProps) {
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
        enqueue(msg.data as NudgeData);
      }
    },
    [enqueue],
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
      <NudgeToast nudge={activeNudge} onDismiss={dismiss} />
    </div>
  );
}
