"""Degradation detection — tracks face detection failure and audio unavailability.

Monitors per-participant degradation states:
- Face not detected for >5 seconds → warning
- No audio received for >60 seconds → warning
Reports state transitions as DegradationChange events.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass

logger = logging.getLogger(__name__)

FACE_TIMEOUT_MS = 5_000  # 5 seconds of no face → warning
AUDIO_TIMEOUT_MS = 60_000  # 60 seconds of no audio → warning


@dataclass
class DegradationChange:
    """A change in degradation warning state for a participant."""

    role: str
    warning_type: str  # "face_not_detected" or "audio_unavailable"
    active: bool


class DegradationTracker:
    """Tracks face detection failure and audio unavailability per session/role.

    Detects when a participant's face hasn't been detected for >5 seconds
    or when no audio has been received for >60 seconds, and reports
    state transitions as DegradationChange events.
    """

    def __init__(self) -> None:
        # When face was first seen as None (session_id -> role -> timestamp_ms)
        self._face_null_since: dict[str, dict[str, int | None]] = defaultdict(
            lambda: {"tutor": None, "student": None}
        )
        # Current face warning state (session_id -> role -> bool)
        self._face_warning: dict[str, dict[str, bool]] = defaultdict(
            lambda: {"tutor": False, "student": False}
        )

        # Last audio chunk received (session_id -> role -> timestamp_ms)
        self._last_audio: dict[str, dict[str, int | None]] = defaultdict(
            lambda: {"tutor": None, "student": None}
        )
        # Current audio warning state
        self._audio_warning: dict[str, dict[str, bool]] = defaultdict(
            lambda: {"tutor": False, "student": False}
        )

    def update_face_status(
        self,
        session_id: str,
        role: str,
        eye_contact: float | None,
        timestamp_ms: int,
    ) -> DegradationChange | None:
        """Update face detection status. Returns change if warning state changed.

        Args:
            session_id: Session identifier.
            role: "tutor" or "student".
            eye_contact: Eye contact score, or None if face not detected.
            timestamp_ms: Current timestamp in ms.

        Returns:
            DegradationChange if warning activated or cleared, None otherwise.
        """
        face_detected = eye_contact is not None

        if face_detected:
            # Face is back — clear tracking and maybe clear warning
            self._face_null_since[session_id][role] = None
            if self._face_warning[session_id][role]:
                self._face_warning[session_id][role] = False
                return DegradationChange(
                    role=role, warning_type="face_not_detected", active=False
                )
        else:
            # Face not detected — start or continue tracking
            if self._face_null_since[session_id][role] is None:
                self._face_null_since[session_id][role] = timestamp_ms

            elapsed = timestamp_ms - self._face_null_since[session_id][role]
            if elapsed >= FACE_TIMEOUT_MS and not self._face_warning[session_id][role]:
                self._face_warning[session_id][role] = True
                return DegradationChange(
                    role=role, warning_type="face_not_detected", active=True
                )

        return None

    def update_audio_status(
        self,
        session_id: str,
        role: str,
        timestamp_ms: int,
    ) -> DegradationChange | None:
        """Record audio chunk receipt. Returns change if warning was cleared.

        Args:
            session_id: Session identifier.
            role: "tutor" or "student".
            timestamp_ms: Current timestamp in ms.

        Returns:
            DegradationChange if audio warning cleared, None otherwise.
        """
        self._last_audio[session_id][role] = timestamp_ms

        if self._audio_warning[session_id][role]:
            self._audio_warning[session_id][role] = False
            return DegradationChange(
                role=role, warning_type="audio_unavailable", active=False
            )

        return None

    def check_audio_timeout(
        self,
        session_id: str,
        role: str,
        current_time_ms: int,
    ) -> DegradationChange | None:
        """Check if audio has timed out for a participant.

        Args:
            session_id: Session identifier.
            role: "tutor" or "student".
            current_time_ms: Current timestamp in ms.

        Returns:
            DegradationChange if audio timeout just activated, None otherwise.
        """
        last = self._last_audio[session_id][role]
        if last is None:
            return None  # Never received audio — don't warn

        elapsed = current_time_ms - last
        if elapsed >= AUDIO_TIMEOUT_MS and not self._audio_warning[session_id][role]:
            self._audio_warning[session_id][role] = True
            return DegradationChange(
                role=role, warning_type="audio_unavailable", active=True
            )

        return None

    def is_face_degraded(self, session_id: str, role: str) -> bool:
        """Whether face detection is currently failing for a participant."""
        return self._face_warning[session_id][role]

    def is_audio_degraded(self, session_id: str, role: str) -> bool:
        """Whether audio is currently unavailable for a participant."""
        return self._audio_warning[session_id][role]

    def clear_session(self, session_id: str) -> None:
        """Clean up all state for a session."""
        self._face_null_since.pop(session_id, None)
        self._face_warning.pop(session_id, None)
        self._last_audio.pop(session_id, None)
        self._audio_warning.pop(session_id, None)
