"""In-memory buffer for audio chunks received via WebSocket."""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

logger = logging.getLogger(__name__)


class AudioChunkBuffer:
    """Thread-safe buffer for audio chunks organized by session and role.

    Stores base64-encoded PCM audio chunks as they arrive from WebSocket
    connections. Chunks can be consumed by the audio analysis pipeline.
    """

    def __init__(self) -> None:
        self._chunks: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(
            lambda: defaultdict(list)
        )

    def add_chunk(
        self, session_id: str, role: str, data: str, timestamp: int
    ) -> None:
        """Store an audio chunk for a given session and role.

        Args:
            session_id: The session this chunk belongs to.
            role: "tutor" or "student".
            data: Base64-encoded PCM audio data.
            timestamp: Timestamp in ms relative to session start.
        """
        self._chunks[session_id][role].append(
            {"data": data, "timestamp": timestamp}
        )

    def get_chunks(self, session_id: str, role: str) -> list[dict[str, Any]]:
        """Return all buffered chunks for a session/role without consuming them."""
        if session_id not in self._chunks:
            return []
        return list(self._chunks[session_id].get(role, []))

    def consume_chunks(self, session_id: str, role: str) -> list[dict[str, Any]]:
        """Return and clear all buffered chunks for a session/role.

        Used by the audio analysis pipeline to process accumulated chunks.
        """
        if session_id not in self._chunks:
            return []
        chunks = self._chunks[session_id].get(role, [])
        result = list(chunks)
        chunks.clear()
        return result

    def clear_session(self, session_id: str) -> None:
        """Remove all audio data for a session (both roles)."""
        self._chunks.pop(session_id, None)
