"""WebSocket endpoint for real-time session communication."""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import UTC, datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from starlette.websockets import WebSocketState

from app.audio.buffer import AudioChunkBuffer
from app.auth.jwt import decode_access_token
from app.auth.router import DEFAULT_PREFERENCES
from app.metrics.aggregator import MetricsAggregator
from app.metrics.buffer import ClientMetricsBuffer
from app.metrics.degradation import DegradationTracker
from app.models.models import Nudge, NudgePriority, NudgeType, SessionStatus, Tutor
from app.nudges.engine import NudgeEngine
from app.websocket.registry import ConnectionRegistry

logger = logging.getLogger(__name__)

router = APIRouter()
registry = ConnectionRegistry()
audio_buffer = AudioChunkBuffer()
client_metrics_buffer = ClientMetricsBuffer()
metrics_aggregator = MetricsAggregator()
nudge_engine = NudgeEngine()
degradation_tracker = DegradationTracker()

# Per-session tutor preferences cache (loaded on connect, updated per broadcast)
_session_preferences: dict[str, dict] = {}

# Per-session student reconnection timers (session_id → asyncio.Task)
_reconnect_timers: dict[str, asyncio.Task] = {}

HEARTBEAT_INTERVAL_S = 10
BROADCAST_INTERVAL_S = 1  # Server metrics broadcast frequency
RECONNECT_TIMEOUT_S = 30  # Grace period before auto-ending on student disconnect


def _authenticate(token: str | None, session_id: str) -> tuple[str, str] | None:
    """Validate token and return (role, subject_id) or None.

    Tutor tokens have role=tutor, sub=<tutor_uuid>.
    Student tokens have role=student, sub=<session_uuid>.
    """
    if not token:
        return None

    payload = decode_access_token(token)
    if payload is None:
        return None

    sub: str = payload.get("sub", "")
    role: str = payload.get("role", "")

    if role == "student":
        # Student token — verify it matches this session
        if sub != session_id:
            return None
        return ("student", sub)

    if role == "tutor" and sub:
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
        logger.warning("Failed to load tutor preferences for session=%s", session_id)
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
        logger.warning("Failed to persist nudge for session=%s", session_id)


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


async def _send_degradation_change(session_id: str, change) -> None:
    """Send a degradation_warning message to the tutor if a state change occurred."""
    if change is not None:
        await _send_to_tutor(session_id, {
            "type": "degradation_warning",
            "data": {
                "role": change.role,
                "warning_type": change.warning_type,
                "active": change.active,
            },
        })


async def _notify_student_status(session_id: str, connected: bool) -> None:
    """Notify the tutor about student connection status changes."""
    await _send_to_tutor(session_id, {
        "type": "student_status",
        "data": {"connected": connected},
    })


async def _send_to_student(session_id: str, message: dict) -> None:
    """Send a JSON message to the student's WebSocket if connected."""
    student_ws = registry.get(session_id, "student")
    if student_ws is not None:
        try:
            if student_ws.client_state == WebSocketState.CONNECTED:
                await student_ws.send_json(message)
        except Exception:
            logger.debug("Failed to send to student: session=%s", session_id)


async def _broadcast_session_ended(session_id: str, reason: str) -> None:
    """Send session_ended message to both tutor and student."""
    message = {
        "type": "session_ended",
        "data": {
            "reason": reason,
            "timestamp_ms": int(time.time() * 1000),
        },
    }
    await _send_to_tutor(session_id, message)
    await _send_to_student(session_id, message)


async def _end_session_in_db(session_id: str) -> None:
    """Mark the session as completed in the database."""
    try:
        factory = _get_session_factory()
        async with factory() as db:
            from sqlalchemy import update

            from app.models.models import Session as SessionModel

            await db.execute(
                update(SessionModel)
                .where(SessionModel.id == session_id)
                .values(
                    status=SessionStatus.COMPLETED,
                    end_time=datetime.now(UTC),
                )
            )
            await db.commit()
    except Exception:
        logger.warning("Failed to update session status: session=%s", session_id)


async def _reconnect_timeout(session_id: str) -> None:
    """Wait for reconnection timeout, then auto-end the session."""
    try:
        await asyncio.sleep(RECONNECT_TIMEOUT_S)
        # Timeout expired — student didn't reconnect
        logger.info("Student reconnect timeout: session=%s", session_id)
        await _broadcast_session_ended(session_id, "student_disconnect_timeout")
        await _end_session_in_db(session_id)
    except asyncio.CancelledError:
        pass  # Timer cancelled — student reconnected
    finally:
        _reconnect_timers.pop(session_id, None)


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

    # Verify tutor owns this session
    if role == "tutor":
        try:
            import uuid as _uuid

            sid = _uuid.UUID(session_id)
            tid = _uuid.UUID(subject_id)
            factory = _get_session_factory()
            async with factory() as db:
                from app.models.models import Session as SessionModel

                result = await db.execute(
                    select(SessionModel).where(
                        SessionModel.id == sid,
                        SessionModel.tutor_id == tid,
                    )
                )
                if result.scalar_one_or_none() is None:
                    await websocket.close(code=4003, reason="Not authorized for this session")
                    return
        except ValueError:
            await websocket.close(code=4001, reason="Authentication failed")
            return
        except Exception:
            logger.warning("Failed to verify session ownership: session=%s", session_id)
            await websocket.close(code=4001, reason="Authentication failed")
            return

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

    # Notify tutor when student connects; cancel any pending reconnect timer
    if role == "student":
        timer = _reconnect_timers.pop(session_id, None)
        if timer is not None:
            timer.cancel()
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
            if msg_type == "end_session" and role == "tutor":
                await _broadcast_session_ended(session_id, "tutor_ended")
                await _end_session_in_db(session_id)
                break
            elif msg_type == "audio_chunk":
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
                # Track audio liveness for degradation detection
                audio_change = degradation_tracker.update_audio_status(
                    session_id, role, timestamp
                )
                await _send_degradation_change(session_id, audio_change)
            elif msg_type == "client_metrics":
                metrics_data = data.get("data", {})
                eye_contact = metrics_data.get("eye_contact_score")
                facial_energy = metrics_data.get("facial_energy")
                client_metrics_buffer.add_metrics(
                    session_id, role, eye_contact, facial_energy, timestamp,
                )
                # Update aggregator with client metrics
                metrics_aggregator.update_client_metrics(
                    session_id, role, eye_contact, facial_energy, timestamp,
                )

                # Track face detection for degradation warnings
                face_change = degradation_tracker.update_face_status(
                    session_id, role, eye_contact, timestamp
                )
                await _send_degradation_change(session_id, face_change)

                # Check audio timeouts for both participants
                for check_role in ("tutor", "student"):
                    audio_timeout = degradation_tracker.check_audio_timeout(
                        session_id, check_role, timestamp
                    )
                    await _send_degradation_change(session_id, audio_timeout)

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

        # Notify tutor when student disconnects; start reconnection timer
        if role == "student":
            await _notify_student_status(session_id, connected=False)
            # Only start timer if tutor is still connected (session not already ended)
            if registry.get(session_id, "tutor") is not None:
                _reconnect_timers[session_id] = asyncio.create_task(
                    _reconnect_timeout(session_id)
                )

        # Clean up session state when tutor disconnects
        if role == "tutor":
            _session_preferences.pop(session_id, None)
            nudge_engine.clear_session(session_id)
            degradation_tracker.clear_session(session_id)
