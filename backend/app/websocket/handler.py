"""WebSocket endpoint for real-time session communication."""

from __future__ import annotations

import asyncio
import logging
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from starlette.websockets import WebSocketState

from app.audio.buffer import AudioChunkBuffer
from app.auth.jwt import decode_access_token
from app.auth.router import DEFAULT_PREFERENCES
from app.metrics.aggregator import MetricsAggregator
from app.metrics.buffer import ClientMetricsBuffer
from app.models.models import Nudge, NudgePriority, NudgeType, Tutor
from app.nudges.engine import NudgeEngine
from app.websocket.registry import ConnectionRegistry

logger = logging.getLogger(__name__)

router = APIRouter()
registry = ConnectionRegistry()
audio_buffer = AudioChunkBuffer()
client_metrics_buffer = ClientMetricsBuffer()
metrics_aggregator = MetricsAggregator()
nudge_engine = NudgeEngine()

# Per-session tutor preferences cache (loaded on connect, updated per broadcast)
_session_preferences: dict[str, dict] = {}

HEARTBEAT_INTERVAL_S = 10
BROADCAST_INTERVAL_S = 1  # Server metrics broadcast frequency


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


def _get_session_factory():
    """Lazy import of session factory to avoid circular imports and test issues."""
    from app.database import async_session_factory
    return async_session_factory


async def _load_tutor_preferences(session_id: str, tutor_id: str) -> None:
    """Load tutor preferences from DB and cache for nudge evaluation.

    Falls back to DEFAULT_PREFERENCES if DB is unavailable.
    """
    try:
        factory = _get_session_factory()
        async with factory() as db:
            result = await db.execute(
                select(Tutor.preferences).where(Tutor.id == tutor_id)
            )
            prefs = result.scalar_one_or_none()
            _session_preferences[session_id] = prefs if prefs else DEFAULT_PREFERENCES
    except Exception:
        logger.debug("Failed to load tutor preferences for session=%s", session_id)
        _session_preferences[session_id] = DEFAULT_PREFERENCES


async def _persist_nudge(
    session_id: str, nudge_type: str, message: str, priority: str,
    trigger_metrics: dict, timestamp_ms: int,
) -> None:
    """Persist a nudge to the database. Fails silently if DB unavailable."""
    try:
        factory = _get_session_factory()
        async with factory() as db:
            nudge = Nudge(
                session_id=session_id,
                timestamp_ms=timestamp_ms,
                nudge_type=NudgeType(nudge_type),
                message=message,
                priority=NudgePriority(priority),
                trigger_metrics=trigger_metrics,
            )
            db.add(nudge)
            await db.commit()
    except Exception:
        logger.debug("Failed to persist nudge for session=%s", session_id)


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


async def _send_to_tutor(session_id: str, message: dict) -> None:
    """Send a JSON message to the tutor's WebSocket if connected."""
    tutor_ws = registry.get(session_id, "tutor")
    if tutor_ws is not None:
        try:
            if tutor_ws.client_state == WebSocketState.CONNECTED:
                await tutor_ws.send_json(message)
        except Exception:
            logger.debug("Failed to send to tutor: session=%s", session_id)


async def _broadcast_metrics(session_id: str, timestamp_ms: int) -> None:
    """Build and send server_metrics snapshot to the tutor.

    Also sends any pending attention_drift change messages and evaluates
    nudge rules against the snapshot.
    """
    snapshot = metrics_aggregator.get_snapshot(session_id, timestamp_ms)

    await _send_to_tutor(session_id, {
        "type": "server_metrics",
        "data": snapshot,
    })

    # Send any drift state changes
    drift_changes = metrics_aggregator.get_drift_changes(session_id)
    for change in drift_changes:
        await _send_to_tutor(session_id, {
            "type": "attention_drift",
            "data": change,
        })

    # Evaluate nudge rules
    preferences = _session_preferences.get(session_id, {})
    if preferences:
        nudges = nudge_engine.evaluate(session_id, snapshot, preferences)
        for nudge in nudges:
            await _send_to_tutor(session_id, {
                "type": "nudge",
                "data": {
                    "nudge_type": nudge.nudge_type,
                    "message": nudge.message,
                    "priority": nudge.priority,
                },
                "timestamp": nudge.timestamp_ms,
            })
            await _persist_nudge(
                session_id, nudge.nudge_type, nudge.message,
                nudge.priority, nudge.trigger_metrics, nudge.timestamp_ms,
            )


async def _notify_student_status(session_id: str, connected: bool) -> None:
    """Notify the tutor about student connection status changes."""
    await _send_to_tutor(session_id, {
        "type": "student_status",
        "data": {"connected": connected},
    })


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

    # Load tutor preferences for nudge evaluation (fire-and-forget)
    if role == "tutor":
        _session_preferences[session_id] = DEFAULT_PREFERENCES
        asyncio.create_task(_load_tutor_preferences(session_id, subject_id))

    # Notify tutor when student connects
    if role == "student":
        await _notify_student_status(session_id, connected=True)

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
            timestamp = data.get("timestamp", int(time.time() * 1000))

            # Dispatch by message type
            msg_type = data.get("type")
            if msg_type == "audio_chunk":
                audio_buffer.add_chunk(
                    session_id,
                    role,
                    data.get("data", ""),
                    timestamp,
                )
                # Process through aggregator
                metrics_aggregator.process_audio_chunk(
                    session_id, role, data.get("data", ""), timestamp
                )
            elif msg_type == "client_metrics":
                metrics_data = data.get("data", {})
                client_metrics_buffer.add_metrics(
                    session_id,
                    role,
                    metrics_data.get("eye_contact_score"),
                    metrics_data.get("facial_energy"),
                    timestamp,
                )
                # Update aggregator with client metrics
                metrics_aggregator.update_client_metrics(
                    session_id,
                    role,
                    metrics_data.get("eye_contact_score"),
                    metrics_data.get("facial_energy"),
                    timestamp,
                )

                # Broadcast metrics to tutor on each client_metrics update
                await _broadcast_metrics(session_id, timestamp)

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: session=%s role=%s", session_id, role)
    except Exception:
        logger.exception("WebSocket error: session=%s role=%s", session_id, role)
    finally:
        if heartbeat_task is not None:
            heartbeat_task.cancel()
        registry.remove(session_id, role)

        # Notify tutor when student disconnects
        if role == "student":
            await _notify_student_status(session_id, connected=False)

        # Clean up nudge state when tutor disconnects
        if role == "tutor":
            _session_preferences.pop(session_id, None)
            nudge_engine.clear_session(session_id)
