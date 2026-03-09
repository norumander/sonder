"""Interruption detection from overlapping speech across participant channels."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# Minimum overlap duration (ms) to count as an interruption
OVERLAP_THRESHOLD_MS = 300


class InterruptionDetector:
    """Detects interruptions by cross-referencing VAD results from two channels.

    An interruption is counted when both participants show active speech
    for >300ms simultaneously. The interrupter is identified as the
    participant who started speaking second.
    """

    def __init__(self) -> None:
        # Per-session state
        self._state: dict[str, _SessionState] = {}

    def update(
        self,
        session_id: str,
        tutor_is_speech: bool,
        student_is_speech: bool,
        timestamp_ms: int,
    ) -> None:
        """Process a new VAD result for both channels at a given timestamp.

        Args:
            session_id: The session this update belongs to.
            tutor_is_speech: Whether the tutor channel has active speech.
            student_is_speech: Whether the student channel has active speech.
            timestamp_ms: Current timestamp in ms.
        """
        if session_id not in self._state:
            self._state[session_id] = _SessionState()

        self._state[session_id].process(
            tutor_is_speech, student_is_speech, timestamp_ms
        )

    def get_counts(self, session_id: str) -> dict[str, int]:
        """Return interruption counts for a session.

        Returns:
            Dict with keys: total, tutor (tutor interrupted), student (student interrupted).
        """
        if session_id not in self._state:
            return {"total": 0, "tutor": 0, "student": 0}
        return self._state[session_id].get_counts()

    def clear_session(self, session_id: str) -> None:
        """Remove all interruption data for a session."""
        self._state.pop(session_id, None)


class _SessionState:
    """Internal per-session state for interruption tracking."""

    def __init__(self) -> None:
        self._total: int = 0
        self._tutor_interruptions: int = 0
        self._student_interruptions: int = 0

        # Overlap tracking
        self._overlap_start_ms: int | None = None
        self._interrupter: str | None = None  # "tutor", "student", or None (simultaneous)

        # Previous state for detecting who started second
        self._prev_tutor: bool = False
        self._prev_student: bool = False
        self._overlap_counted: bool = False

    def process(
        self, tutor_is_speech: bool, student_is_speech: bool, timestamp_ms: int
    ) -> None:
        """Process a single timestamp update."""
        both_speaking = tutor_is_speech and student_is_speech

        if both_speaking:
            if self._overlap_start_ms is None:
                # Overlap just started
                self._overlap_start_ms = timestamp_ms
                self._overlap_counted = False

                # Determine interrupter: who started speaking second?
                if self._prev_tutor and not self._prev_student:
                    self._interrupter = "student"
                elif self._prev_student and not self._prev_tutor:
                    self._interrupter = "tutor"
                else:
                    self._interrupter = None  # Simultaneous start

            # Check if overlap exceeds threshold
            if (
                not self._overlap_counted
                and (timestamp_ms - self._overlap_start_ms) >= OVERLAP_THRESHOLD_MS
            ):
                self._overlap_counted = True
                self._total += 1
                if self._interrupter == "tutor":
                    self._tutor_interruptions += 1
                elif self._interrupter == "student":
                    self._student_interruptions += 1
        else:
            # Overlap ended (or never started)
            self._overlap_start_ms = None
            self._interrupter = None

        self._prev_tutor = tutor_is_speech
        self._prev_student = student_is_speech

    def get_counts(self) -> dict[str, int]:
        """Return current interruption counts."""
        return {
            "total": self._total,
            "tutor": self._tutor_interruptions,
            "student": self._student_interruptions,
        }
