"""Running talk time percentage tracker per session and participant."""

from __future__ import annotations

import logging
from collections import defaultdict

logger = logging.getLogger(__name__)


class TalkTimeTracker:
    """Tracks cumulative talk time percentages per session/role.

    Maintains running totals of speech frames and total frames for each
    participant. Talk time percentage = (speech_frames / total_frames) * 100.
    """

    def __init__(self) -> None:
        # {session_id: {role: {"speech": int, "total": int}}}
        self._counters: dict[str, dict[str, dict[str, int]]] = defaultdict(
            lambda: defaultdict(lambda: {"speech": 0, "total": 0})
        )

    def update(
        self, session_id: str, role: str, speech_frames: int, total_frames: int
    ) -> None:
        """Add speech/total frame counts from a new audio chunk analysis.

        Args:
            session_id: The session this update belongs to.
            role: "tutor" or "student".
            speech_frames: Number of frames classified as speech.
            total_frames: Total number of frames analyzed.
        """
        counters = self._counters[session_id][role]
        counters["speech"] += speech_frames
        counters["total"] += total_frames

    def get_talk_pct(self, session_id: str, role: str) -> float | None:
        """Return the running talk time percentage for a session/role.

        Returns:
            Talk time as a percentage (0.0–100.0), or None if no data.
        """
        if session_id not in self._counters:
            return None
        if role not in self._counters[session_id]:
            return None
        counters = self._counters[session_id][role]
        if counters["total"] == 0:
            return None
        return (counters["speech"] / counters["total"]) * 100.0

    def clear_session(self, session_id: str) -> None:
        """Remove all talk time data for a session."""
        self._counters.pop(session_id, None)
