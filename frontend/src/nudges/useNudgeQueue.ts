/**
 * Hook that manages a FIFO queue of nudges with max 1 visible at a time
 * and auto-dismiss after 8 seconds.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { NudgeData } from "../shared/types";

/** Duration in ms before a nudge auto-dismisses. */
const AUTO_DISMISS_MS = 8000;

export interface NudgeQueueState {
  /** The currently visible nudge, or null if none. */
  activeNudge: NudgeData | null;
  /** Number of nudges waiting in the queue (not including active). */
  queueLength: number;
  /** Add a nudge to the queue. Shows immediately if nothing active. */
  enqueue: (nudge: NudgeData) => void;
  /** Manually dismiss the active nudge. */
  dismiss: () => void;
}

export function useNudgeQueue(): NudgeQueueState {
  const [activeNudge, setActiveNudge] = useState<NudgeData | null>(null);
  const queueRef = useRef<NudgeData[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [queueLength, setQueueLength] = useState(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const showNext = useCallback(() => {
    clearTimer();
    const next = queueRef.current.shift();
    setQueueLength(queueRef.current.length);
    if (next) {
      setActiveNudge(next);
      timerRef.current = setTimeout(() => {
        showNext();
      }, AUTO_DISMISS_MS);
    } else {
      setActiveNudge(null);
    }
  }, [clearTimer]);

  const enqueue = useCallback(
    (nudge: NudgeData) => {
      if (activeNudge === null && queueRef.current.length === 0) {
        setActiveNudge(nudge);
        timerRef.current = setTimeout(() => {
          showNext();
        }, AUTO_DISMISS_MS);
      } else {
        queueRef.current.push(nudge);
        setQueueLength(queueRef.current.length);
      }
    },
    [activeNudge, showNext],
  );

  const dismiss = useCallback(() => {
    showNext();
  }, [showNext]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return { activeNudge, queueLength, enqueue, dismiss };
}
