"""In-memory buffer for client-side metrics received via WebSocket."""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

logger = logging.getLogger(__name__)

# Maximum number of metric entries to keep per session/role.
# At 2 entries/second, 600 entries = 5 minutes of history.
MAX_ENTRIES_PER_ROLE = 600


class ClientMetricsBuffer:
    """Buffer for client-side metrics (eye contact, facial energy) per session/role.

    Stores the latest and historical metrics as they arrive from each
    participant's browser. Used by the server-side metrics engine to combine
    client metrics with server-computed audio metrics.
    Oldest entries are evicted when the buffer exceeds MAX_ENTRIES_PER_ROLE.
    """

    def __init__(self) -> None:
        self._history: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(
            lambda: defaultdict(list)
        )

    def add_metrics(
        self,
        session_id: str,
        role: str,
        eye_contact_score: float | None,
        facial_energy: float | None,
        timestamp: int,
    ) -> None:
        """Store a client metrics snapshot for a session/role.

        Evicts oldest entries if buffer exceeds MAX_ENTRIES_PER_ROLE.

        Args:
            session_id: The session this metric belongs to.
            role: "tutor" or "student".
            eye_contact_score: Eye contact score (0.0–1.0) or None if face not detected.
            facial_energy: Facial energy score (0.0–1.0) or None if face not detected.
            timestamp: Timestamp in ms relative to session start.
        """
        buf = self._history[session_id][role]
        buf.append({
            "eye_contact_score": eye_contact_score,
            "facial_energy": facial_energy,
            "timestamp": timestamp,
        })
        if len(buf) > MAX_ENTRIES_PER_ROLE:
            del buf[: len(buf) - MAX_ENTRIES_PER_ROLE]

    def get_latest(self, session_id: str, role: str) -> dict[str, Any] | None:
        """Return the most recent metrics for a session/role, or None."""
        if session_id not in self._history:
            return None
        entries = self._history[session_id].get(role, [])
        if not entries:
            return None
        return entries[-1]

    def get_history(self, session_id: str, role: str) -> list[dict[str, Any]]:
        """Return all buffered metrics for a session/role."""
        if session_id not in self._history:
            return []
        return list(self._history[session_id].get(role, []))

    def clear_session(self, session_id: str) -> None:
        """Remove all metrics for a session (both roles)."""
        self._history.pop(session_id, None)
