"""Tests for session lifecycle management — TASK-019."""

import asyncio
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from starlette.testclient import TestClient

from app.auth.jwt import create_access_token, create_student_token
from app.models.base import Base
from app.models.models import Session, SessionStatus, Tutor

# --- Fixtures ---


@pytest.fixture
async def db_engine():
    """Create an in-memory SQLite async engine for testing."""
    engine = create_async_engine("sqlite+aiosqlite://", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def db_session(db_engine):
    """Create an async session from the shared test engine."""
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session


@pytest.fixture
async def test_app(db_engine, db_session):
    """Create a FastAPI test app with DB session override."""
    from app.database import get_db
    from app.main import app
    from app.websocket import handler

    async def override_get_db():
        yield db_session

    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    app.dependency_overrides[get_db] = override_get_db
    original_factory = handler._get_session_factory

    def mock_factory():
        return factory

    handler._get_session_factory = mock_factory

    yield app

    app.dependency_overrides.clear()
    handler._get_session_factory = original_factory


@pytest.fixture
def sync_client(test_app):
    """Synchronous test client for WebSocket tests."""
    return TestClient(test_app)


@pytest.fixture
async def tutor_and_session(db_session):
    """Create a tutor with an active session."""
    tutor = Tutor(
        id=uuid.uuid4(),
        google_id="google-lifecycle-test",
        name="Lifecycle Tutor",
        email="lifecycle@example.com",
        preferences={},
    )
    db_session.add(tutor)
    await db_session.flush()

    session = Session(
        id=uuid.uuid4(),
        tutor_id=tutor.id,
        join_code="LIFE01",
        status=SessionStatus.ACTIVE,
        student_display_name="Test Student",
        start_time=datetime.now(UTC),
        join_time=datetime.now(UTC),
    )
    db_session.add(session)
    await db_session.commit()

    tutor_token = create_access_token(tutor_id=str(tutor.id))
    student_token = create_student_token(session_id=str(session.id))

    return tutor, session, tutor_token, student_token


def _drain_until(ws, msg_type: str, max_messages: int = 10) -> dict:
    """Read messages from ws until we get one with the given type."""
    for _ in range(max_messages):
        msg = ws.receive_json()
        if msg["type"] == msg_type:
            return msg
    raise AssertionError(f"Did not receive message of type '{msg_type}'")


# --- Reconnection Timer Unit Tests ---


def test_reconnect_timers_dict_exists():
    """Handler module exposes reconnection timer tracking."""
    from app.websocket.handler import _reconnect_timers

    assert isinstance(_reconnect_timers, dict)


@pytest.mark.asyncio
async def test_reconnect_timeout_ends_session_after_delay():
    """_reconnect_timeout waits then calls broadcast and DB update."""
    from app.websocket import handler

    session_id = str(uuid.uuid4())

    with (
        patch.object(handler, "_broadcast_session_ended", new_callable=AsyncMock) as mock_broadcast,
        patch.object(handler, "_end_session_in_db", new_callable=AsyncMock) as mock_end_db,
        patch.object(handler, "RECONNECT_TIMEOUT_S", 0.01),
    ):
        handler._reconnect_timers[session_id] = asyncio.create_task(
            handler._reconnect_timeout(session_id)
        )
        await asyncio.sleep(0.05)

        mock_broadcast.assert_called_once_with(session_id, "student_disconnect_timeout")
        mock_end_db.assert_called_once_with(session_id)
        assert session_id not in handler._reconnect_timers


@pytest.mark.asyncio
async def test_reconnect_timeout_cancelled_cleans_up():
    """Cancelling the reconnect timer removes it from the dict."""
    from app.websocket import handler

    session_id = str(uuid.uuid4())

    with patch.object(handler, "RECONNECT_TIMEOUT_S", 10):
        task = asyncio.create_task(handler._reconnect_timeout(session_id))
        handler._reconnect_timers[session_id] = task

        await asyncio.sleep(0.01)
        task.cancel()
        await asyncio.sleep(0.01)

        assert session_id not in handler._reconnect_timers


# --- Student Reconnection Integration Test ---


def test_student_can_reconnect_after_disconnect(sync_client, tutor_and_session):
    """Student can reconnect to a session after disconnecting."""
    _, session, tutor_token, student_token = tutor_and_session

    with sync_client.websocket_connect(
        f"/ws/session/{session.id}?token={tutor_token}"
    ):
        # First connection
        with sync_client.websocket_connect(
            f"/ws/session/{session.id}?token={student_token}"
        ):
            pass  # student connects then disconnects

        # Reconnection should succeed (slot is freed)
        with sync_client.websocket_connect(
            f"/ws/session/{session.id}?token={student_token}"
        ) as student_ws:
            student_ws.send_json({"type": "ping"})


# --- Session Ended Broadcast Tests ---


def test_end_session_broadcasts_to_student(sync_client, tutor_and_session):
    """Tutor sending end_session triggers session_ended to student."""
    _, session, tutor_token, student_token = tutor_and_session

    with sync_client.websocket_connect(
        f"/ws/session/{session.id}?token={tutor_token}"
    ) as tutor_ws:
        with sync_client.websocket_connect(
            f"/ws/session/{session.id}?token={student_token}"
        ) as student_ws:
            tutor_ws.send_json({"type": "end_session"})

            msg = _drain_until(student_ws, "session_ended")
            assert msg["data"]["reason"] == "tutor_ended"


def test_end_session_broadcasts_to_tutor(sync_client, tutor_and_session):
    """Tutor also receives session_ended confirmation."""
    _, session, tutor_token, student_token = tutor_and_session

    with sync_client.websocket_connect(
        f"/ws/session/{session.id}?token={tutor_token}"
    ) as tutor_ws:
        with sync_client.websocket_connect(
            f"/ws/session/{session.id}?token={student_token}"
        ):
            tutor_ws.send_json({"type": "end_session"})

            # Drain student_status (from student connect) and find session_ended
            msg = _drain_until(tutor_ws, "session_ended")
            assert msg["data"]["reason"] == "tutor_ended"


def test_end_session_only_tutor_can_trigger(sync_client, tutor_and_session):
    """Student cannot send end_session — message is ignored."""
    _, session, tutor_token, student_token = tutor_and_session

    with sync_client.websocket_connect(
        f"/ws/session/{session.id}?token={tutor_token}"
    ):
        with sync_client.websocket_connect(
            f"/ws/session/{session.id}?token={student_token}"
        ) as student_ws:
            # Student tries to send end_session — should be ignored
            student_ws.send_json({"type": "end_session"})
            # Student can still send other messages (connection not closed)
            student_ws.send_json({"type": "client_metrics", "data": {"eye_contact_score": 0.5}})
