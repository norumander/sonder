"""Rolling-window talk time percentage tracker per session and participant.

Uses a 2-minute sliding window so the displayed percentage reflects
recent behavior rather than the cumulative session average.
"""

from __future__ import annotations

import logging
from collections import defaultdict, deque

logger = logging.getLogger(__name__)

# 2-minute rolling window
WINDOW_MS = 120_000


class TalkTimeTracker:
    """Tracks talk time percentages over a rolling window per session/role.

    Maintains a deque of recent (timestamp, speech_frames, total_frames)
    entries and prunes anything older than WINDOW_MS. Talk time percentage
    is computed from the windowed totals only.
    """

    def __init__(self) -> None:
        # {session_id: {role: deque of (timestamp_ms, speech_frames, total_frames)}}
        self._windows: dict[str, dict[str, deque[tuple[int, int, int]]]] = defaultdict(
            lambda: defaultdict(deque)
        )

    def update(
        self,
        session_id: str,
        role: str,
        speech_frames: int,
        total_frames: int,
        timestamp_ms: int,
    ) -> None:
        """Add a new audio chunk result to the rolling window.

        Args:
            session_id: The session this update belongs to.
            role: "tutor" or "student".
            speech_frames: Number of frames classified as speech.
            total_frames: Total number of frames analyzed.
            timestamp_ms: Timestamp of the audio chunk in ms.
        """
        window = self._windows[session_id][role]
        window.append((timestamp_ms, speech_frames, total_frames))

        # Prune entries older than the window
        cutoff = timestamp_ms - WINDOW_MS
        while window and window[0][0] < cutoff:
            window.popleft()

    def get_talk_pct(self, session_id: str, role: str) -> float | None:
        """Return the rolling talk time percentage for a session/role.

        Returns:
            Talk time as a percentage (0.0–100.0), or None if no data.
        """
        if session_id not in self._windows:
            return None
        if role not in self._windows[session_id]:
            return None
        window = self._windows[session_id][role]
        if not window:
            return None

        total_speech = sum(s for _, s, _ in window)
        total_frames = sum(t for _, _, t in window)
        if total_frames == 0:
            return None
        return (total_speech / total_frames) * 100.0

    def clear_session(self, session_id: str) -> None:
        """Remove all talk time data for a session."""
        self._windows.pop(session_id, None)
