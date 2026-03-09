"""WebSocket endpoint for real-time session communication."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.auth.jwt import decode_access_token
from app.websocket.registry import ConnectionRegistry

logger = logging.getLogger(__name__)

router = APIRouter()
registry = ConnectionRegistry()

HEARTBEAT_INTERVAL_S = 10


def _authenticate(token: str | None, session_id: str) -> tuple[str, str] | None:
    """Validate token and return (role, subject_id) or None.

    Tutor tokens have sub=<tutor_uuid>.
    Student tokens have sub=student:<session_uuid>.
    """
    if not token:
        return None

    payload = decode_access_token(token)
    if payload is None:
        return None

    sub: str = payload.get("sub", "")

    if sub.startswith("student:"):
        # Student token — verify it matches this session
        token_session_id = sub.removeprefix("student:")
        if token_session_id != session_id:
            return None
        return ("student", token_session_id)

    # Tutor token — sub is tutor_id
    if sub:
        return ("tutor", sub)

    return None


async def _heartbeat_loop(websocket: WebSocket) -> None:
    """Send heartbeat messages to the client at a fixed interval."""
    try:
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL_S)
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.send_json({"type": "heartbeat"})
            else:
                break
    except Exception:
        pass  # Connection closed — heartbeat loop exits silently


@router.websocket("/ws/session/{session_id}")
async def websocket_session(websocket: WebSocket, session_id: str, token: str | None = None):
    """Handle WebSocket connections for a tutoring session.

    Query params:
        token: JWT (tutor) or participant token (student)
    """
    # Authenticate
    auth_result = _authenticate(token, session_id)
    if auth_result is None:
        await websocket.close(code=4001, reason="Authentication failed")
        return

    role, subject_id = auth_result

    # Check if slot is available
    if registry.connection_count(session_id) >= 2 or registry.is_slot_occupied(session_id, role):
        await websocket.close(code=4002, reason="Session full")
        return

    await websocket.accept()
    registry.add(session_id, role, websocket)
    logger.info("WebSocket connected: session=%s role=%s", session_id, role)

    # Start heartbeat for student
    heartbeat_task = None
    if role == "student":
        heartbeat_task = asyncio.create_task(_heartbeat_loop(websocket))

    try:
        while True:
            data = await websocket.receive_json()
            # Tag message with sender role for server-side processing
            data["_role"] = role
            data["_session_id"] = session_id

            # Client messages (audio chunks, client metrics) are processed
            # server-side. Server_metrics and nudges are sent by the server
            # to the tutor — no client-to-client forwarding.

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: session=%s role=%s", session_id, role)
    except Exception:
        logger.exception("WebSocket error: session=%s role=%s", session_id, role)
    finally:
        if heartbeat_task is not None:
            heartbeat_task.cancel()
        registry.remove(session_id, role)
