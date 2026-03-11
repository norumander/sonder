"""Response latency tracker — measures time between speaker transitions.

Tracks the delay between one participant stopping speech and the other
starting speech. This is a novel engagement metric: shorter response
latencies indicate active listening and conversational flow, while
longer latencies may suggest confusion or disengagement.
"""

from __future__ import annotations

import logging
from collections import defaultdict, deque
from typing import Any

logger = logging.getLogger(__name__)

# Maximum number of latency samples to keep for rolling average
MAX_SAMPLES = 60

# Minimum gap (ms) to count as a response latency rather than overlap
MIN_GAP_MS = 100

# Maximum gap (ms) to count — beyond this it's a pause, not a response
MAX_GAP_MS = 15000


class ResponseLatencyTracker:
    """Tracks response latency between tutor and student speech turns.

    Response latency = time from speaker A stopping to speaker B starting.
    Maintains per-session rolling averages for both directions.
    """

    def __init__(self) -> None:
        # Per-session speech state: {session_id: {role: {"speaking": bool, "transition_ms": int}}}
        self._state: dict[str, dict[str, dict[str, Any]]] = defaultdict(
            lambda: {
                "tutor": {"speaking": False, "transition_ms": 0},
                "student": {"speaking": False, "transition_ms": 0},
            }
        )
        # Per-session latency samples (deque for efficient rolling window)
        self._samples: dict[str, deque[float]] = defaultdict(
            lambda: deque(maxlen=MAX_SAMPLES)
        )

    def update(
        self,
        session_id: str,
        role: str,
        is_speech: bool,
        timestamp_ms: int,
    ) -> None:
        """Update speech state and detect response latency transitions.

        Args:
            session_id: Session identifier.
            role: "tutor" or "student".
            is_speech: Whether the current chunk is speech.
            timestamp_ms: Timestamp of the audio chunk in ms.
        """
        state = self._state[session_id]
        current = state[role]
        was_speaking = current["speaking"]
        other_role = "student" if role == "tutor" else "tutor"
        other = state[other_role]

        if is_speech and not was_speaking:
            # Transition: not speaking → speaking
            # Check if the other person recently stopped speaking
            if not other["speaking"] and other["transition_ms"] > 0:
                gap = timestamp_ms - other["transition_ms"]
                if MIN_GAP_MS <= gap <= MAX_GAP_MS:
                    self._samples[session_id].append(gap)

            current["speaking"] = True
            current["transition_ms"] = timestamp_ms

        elif not is_speech and was_speaking:
            # Transition: speaking → not speaking
            current["speaking"] = False
            current["transition_ms"] = timestamp_ms

    def get_avg_latency_ms(self, session_id: str) -> float | None:
        """Return the rolling average response latency in milliseconds.

        Returns:
            Average latency in ms, or None if no samples collected yet.
        """
        samples = self._samples.get(session_id)
        if not samples:
            return None
        return round(sum(samples) / len(samples), 0)

    def get_sample_count(self, session_id: str) -> int:
        """Return the number of response latency samples collected."""
        samples = self._samples.get(session_id)
        return len(samples) if samples else 0

    def clear_session(self, session_id: str) -> None:
        """Remove all state for a session."""
        self._state.pop(session_id, None)
        self._samples.pop(session_id, None)
