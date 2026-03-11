/**
 * Hook that manages a FIFO queue of nudges with max 1 visible at a time
 * and auto-dismiss after 8 seconds.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { NudgeData } from "../shared/types";

/** Duration in ms before a nudge auto-dismisses. */
const AUTO_DISMISS_MS = 8000;

/** A nudge with its session-relative timestamp. */
export interface TimestampedNudge {
  nudge: NudgeData;
  /** Session-relative timestamp in ms, or null if unavailable. */
  timestampMs: number | null;
}

export interface NudgeQueueState {
  /** The currently visible nudge with timestamp, or null if none. */
  activeNudge: TimestampedNudge | null;
  /** Number of nudges waiting in the queue (not including active). */
  queueLength: number;
  /** Add a nudge to the queue. Shows immediately if nothing active. */
  enqueue: (nudge: NudgeData, timestampMs?: number | null) => void;
  /** Manually dismiss the active nudge. */
  dismiss: () => void;
}

export function useNudgeQueue(): NudgeQueueState {
  const [activeNudge, setActiveNudge] = useState<TimestampedNudge | null>(null);
  const activeNudgeRef = useRef<TimestampedNudge | null>(null);
  const queueRef = useRef<TimestampedNudge[]>([]);
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
      activeNudgeRef.current = next;
      setActiveNudge(next);
      timerRef.current = setTimeout(() => {
        showNext();
      }, AUTO_DISMISS_MS);
    } else {
      activeNudgeRef.current = null;
      setActiveNudge(null);
    }
  }, [clearTimer]);

  const enqueue = useCallback(
    (nudge: NudgeData, timestampMs?: number | null) => {
      const entry: TimestampedNudge = { nudge, timestampMs: timestampMs ?? null };
      if (activeNudgeRef.current === null && queueRef.current.length === 0) {
        activeNudgeRef.current = entry;
        setActiveNudge(entry);
        timerRef.current = setTimeout(() => {
          showNext();
        }, AUTO_DISMISS_MS);
      } else {
        queueRef.current.push(entry);
        setQueueLength(queueRef.current.length);
      }
    },
    [showNext],
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
