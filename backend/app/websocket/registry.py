"""In-memory WebSocket connection registry."""

from __future__ import annotations

from typing import Any


class ConnectionRegistry:
    """Tracks active WebSocket connections per session.

    Each session has at most two slots: "tutor" and "student".
    """

    def __init__(self) -> None:
        self._connections: dict[str, dict[str, Any]] = {}

    def add(self, session_id: str, role: str, websocket: Any) -> None:
        """Register a WebSocket connection for a session role."""
        if session_id not in self._connections:
            self._connections[session_id] = {}
        self._connections[session_id][role] = websocket

    def remove(self, session_id: str, role: str) -> None:
        """Remove a WebSocket connection. Cleans up empty session entries."""
        if session_id in self._connections:
            self._connections[session_id].pop(role, None)
            if not self._connections[session_id]:
                del self._connections[session_id]

    def get(self, session_id: str, role: str) -> Any | None:
        """Get the WebSocket for a session role, or None."""
        return self._connections.get(session_id, {}).get(role)

    def is_slot_occupied(self, session_id: str, role: str) -> bool:
        """Check whether a role slot is occupied for a session."""
        return self.get(session_id, role) is not None

    def connection_count(self, session_id: str) -> int:
        """Return the number of active connections for a session."""
        return len(self._connections.get(session_id, {}))
