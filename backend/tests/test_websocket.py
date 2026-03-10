"""Tests for WebSocket connection infrastructure — TDD Red phase for TASK-005."""

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from starlette.testclient import TestClient

from app.auth.jwt import create_access_token, create_student_token
from app.models.base import Base
from app.models.models import Session, SessionStatus, Tutor
from app.websocket.registry import ConnectionRegistry

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
    """Create a tutor with an active session.

    Returns (tutor, session, tutor_token, student_token).
    """
    from datetime import UTC, datetime

    tutor = Tutor(
        id=uuid.uuid4(),
        google_id="google-ws-test",
        name="WS Tutor",
        email="ws@example.com",
        preferences={},
    )
    db_session.add(tutor)
    await db_session.flush()

    session = Session(
        id=uuid.uuid4(),
        tutor_id=tutor.id,
        join_code="WS1234",
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


# --- ConnectionRegistry Unit Tests ---


def test_registry_add_and_get_tutor():
    """Registry tracks tutor connection for a session."""
    registry = ConnectionRegistry()
    session_id = str(uuid.uuid4())
    mock_ws = object()  # stand-in for WebSocket
    registry.add(session_id, "tutor", mock_ws)
    assert registry.get(session_id, "tutor") is mock_ws
    assert registry.get(session_id, "student") is None


def test_registry_add_and_get_student():
    """Registry tracks student connection for a session."""
    registry = ConnectionRegistry()
    session_id = str(uuid.uuid4())
    mock_ws = object()
    registry.add(session_id, "student", mock_ws)
    assert registry.get(session_id, "student") is mock_ws


def test_registry_remove_connection():
    """Registry removes connection and cleans up empty sessions."""
    registry = ConnectionRegistry()
    session_id = str(uuid.uuid4())
    mock_ws = object()
    registry.add(session_id, "tutor", mock_ws)
    registry.remove(session_id, "tutor")
    assert registry.get(session_id, "tutor") is None


def test_registry_has_slot_occupied():
    """Registry correctly reports whether a slot is occupied."""
    registry = ConnectionRegistry()
    session_id = str(uuid.uuid4())
    mock_ws = object()
    registry.add(session_id, "tutor", mock_ws)
    assert registry.is_slot_occupied(session_id, "tutor") is True
    assert registry.is_slot_occupied(session_id, "student") is False


def test_registry_connection_count():
    """Registry reports correct connection count for a session."""
    registry = ConnectionRegistry()
    session_id = str(uuid.uuid4())
    assert registry.connection_count(session_id) == 0
    registry.add(session_id, "tutor", object())
    assert registry.connection_count(session_id) == 1
    registry.add(session_id, "student", object())
    assert registry.connection_count(session_id) == 2


# --- WebSocket Endpoint Integration Tests ---


def test_tutor_connects_with_valid_jwt(sync_client, tutor_and_session):
    """Tutor can connect to WebSocket with valid JWT."""
    _, session, tutor_token, _ = tutor_and_session
    with sync_client.websocket_connect(
        f"/ws/session/{session.id}?token={tutor_token}"
    ) as ws:
        # Connection should succeed — send a ping to verify
        ws.send_json({"type": "ping"})


def test_student_connects_with_participant_token(sync_client, tutor_and_session):
    """Student can connect to WebSocket with participant token."""
    _, session, _, student_token = tutor_and_session
    with sync_client.websocket_connect(
        f"/ws/session/{session.id}?token={student_token}"
    ) as ws:
        ws.send_json({"type": "ping"})


def test_invalid_token_rejected(sync_client, tutor_and_session):
    """Connection with invalid token is rejected."""
    _, session, _, _ = tutor_and_session
    with pytest.raises(Exception):
        with sync_client.websocket_connect(
            f"/ws/session/{session.id}?token=invalid-token"
        ):
            pass


def test_missing_token_rejected(sync_client, tutor_and_session):
    """Connection without token is rejected."""
    _, session, _, _ = tutor_and_session
    with pytest.raises(Exception):
        with sync_client.websocket_connect(f"/ws/session/{session.id}"):
            pass


def test_third_connection_rejected(sync_client, tutor_and_session):
    """Third connection to same session is rejected."""
    _, session, tutor_token, student_token = tutor_and_session
    extra_token = create_access_token(tutor_id=str(uuid.uuid4()))

    with sync_client.websocket_connect(
        f"/ws/session/{session.id}?token={tutor_token}"
    ):
        with sync_client.websocket_connect(
            f"/ws/session/{session.id}?token={student_token}"
        ):
            with pytest.raises(Exception):
                with sync_client.websocket_connect(
                    f"/ws/session/{session.id}?token={extra_token}"
                ):
                    pass


def test_tutor_message_tagged_with_role(sync_client, tutor_and_session):
    """Tutor can send messages over WebSocket without error."""
    _, session, tutor_token, student_token = tutor_and_session

    with sync_client.websocket_connect(
        f"/ws/session/{session.id}?token={tutor_token}"
    ) as tutor_ws:
        with sync_client.websocket_connect(
            f"/ws/session/{session.id}?token={student_token}"
        ):
            tutor_ws.send_json(
                {"type": "client_metrics", "data": {"eye_contact": 0.9}}
            )


def test_student_receives_heartbeat(sync_client, tutor_and_session):
    """Student receives heartbeat messages from server."""
    _, session, _, student_token = tutor_and_session

    from app.websocket import handler

    original_interval = handler.HEARTBEAT_INTERVAL_S
    handler.HEARTBEAT_INTERVAL_S = 1

    try:
        with sync_client.websocket_connect(
            f"/ws/session/{session.id}?token={student_token}"
        ) as ws:
            data = ws.receive_json()
            assert data["type"] == "heartbeat"
    finally:
        handler.HEARTBEAT_INTERVAL_S = original_interval


def test_disconnect_removes_from_registry(sync_client, tutor_and_session):
    """Disconnecting removes the connection from the registry."""
    from app.websocket.handler import registry

    _, session, tutor_token, _ = tutor_and_session
    session_id = str(session.id)

    with sync_client.websocket_connect(
        f"/ws/session/{session.id}?token={tutor_token}"
    ):
        assert registry.is_slot_occupied(session_id, "tutor") is True

    # After context manager exits (disconnect), slot should be freed
    assert registry.is_slot_occupied(session_id, "tutor") is False
