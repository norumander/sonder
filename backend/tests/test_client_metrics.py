"""Tests for client metrics streaming from browser to server via WebSocket."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from starlette.testclient import TestClient

from app.auth.jwt import create_access_token, create_student_token
from app.metrics.buffer import ClientMetricsBuffer
from app.models.base import Base
from app.models.models import Session as SessionModel
from app.models.models import SessionStatus, Tutor

# --- Unit tests for ClientMetricsBuffer ---


class TestClientMetricsBuffer:
    """Unit tests for the in-memory client metrics buffer."""

    def test_store_and_retrieve_metrics(self):
        buf = ClientMetricsBuffer()
        buf.add_metrics("session-1", "tutor", 0.85, 0.6, timestamp=1000)

        latest = buf.get_latest("session-1", "tutor")
        assert latest is not None
        assert latest["eye_contact_score"] == 0.85
        assert latest["facial_energy"] == 0.6
        assert latest["timestamp"] == 1000

    def test_metrics_stored_per_role(self):
        buf = ClientMetricsBuffer()
        buf.add_metrics("session-1", "tutor", 0.9, 0.7, timestamp=1000)
        buf.add_metrics("session-1", "student", 0.3, 0.2, timestamp=1000)

        tutor = buf.get_latest("session-1", "tutor")
        student = buf.get_latest("session-1", "student")
        assert tutor["eye_contact_score"] == 0.9
        assert student["eye_contact_score"] == 0.3

    def test_metrics_stored_per_session(self):
        buf = ClientMetricsBuffer()
        buf.add_metrics("session-1", "tutor", 0.9, 0.7, timestamp=1000)
        buf.add_metrics("session-2", "tutor", 0.5, 0.3, timestamp=1000)

        s1 = buf.get_latest("session-1", "tutor")
        s2 = buf.get_latest("session-2", "tutor")
        assert s1["eye_contact_score"] == 0.9
        assert s2["eye_contact_score"] == 0.5

    def test_get_latest_returns_most_recent(self):
        buf = ClientMetricsBuffer()
        buf.add_metrics("session-1", "tutor", 0.9, 0.7, timestamp=1000)
        buf.add_metrics("session-1", "tutor", 0.5, 0.3, timestamp=2000)

        latest = buf.get_latest("session-1", "tutor")
        assert latest["eye_contact_score"] == 0.5
        assert latest["timestamp"] == 2000

    def test_get_latest_empty_returns_none(self):
        buf = ClientMetricsBuffer()
        assert buf.get_latest("nonexistent", "tutor") is None

    def test_null_values_accepted(self):
        buf = ClientMetricsBuffer()
        buf.add_metrics("session-1", "tutor", None, None, timestamp=1000)

        latest = buf.get_latest("session-1", "tutor")
        assert latest["eye_contact_score"] is None
        assert latest["facial_energy"] is None

    def test_get_history_returns_all_entries(self):
        buf = ClientMetricsBuffer()
        for i in range(5):
            buf.add_metrics("session-1", "tutor", 0.1 * i, 0.1 * i, timestamp=i * 500)

        history = buf.get_history("session-1", "tutor")
        assert len(history) == 5
        assert history[0]["timestamp"] == 0
        assert history[4]["timestamp"] == 2000

    def test_clear_session_removes_all_roles(self):
        buf = ClientMetricsBuffer()
        buf.add_metrics("session-1", "tutor", 0.9, 0.7, timestamp=1000)
        buf.add_metrics("session-1", "student", 0.5, 0.3, timestamp=1000)

        buf.clear_session("session-1")
        assert buf.get_latest("session-1", "tutor") is None
        assert buf.get_latest("session-1", "student") is None


# --- Integration test fixtures ---


@pytest.fixture
async def db_engine():
    engine = create_async_engine("sqlite+aiosqlite://", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def db_session(db_engine):
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session


@pytest.fixture
async def test_app(db_engine, db_session):
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
    return TestClient(test_app)


@pytest.fixture
async def tutor_and_session(db_session):
    tutor = Tutor(
        id=uuid.uuid4(),
        google_id="google-metrics-test",
        name="Metrics Tutor",
        email="metrics@example.com",
        preferences={},
    )
    db_session.add(tutor)
    await db_session.flush()

    session = SessionModel(
        id=uuid.uuid4(),
        tutor_id=tutor.id,
        join_code="MET123",
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


# --- Integration tests ---


def test_client_metrics_message_accepted(sync_client, tutor_and_session):
    """Server accepts client_metrics messages without error."""
    _, session, tutor_token, _ = tutor_and_session

    with sync_client.websocket_connect(
        f"/ws/session/{session.id}?token={tutor_token}"
    ) as ws:
        ws.send_json({
            "type": "client_metrics",
            "data": {"eye_contact_score": 0.85, "facial_energy": 0.6},
            "timestamp": 1000,
        })
        # Follow-up to verify connection is still alive
        ws.send_json({"type": "ping"})


def test_client_metrics_stored_in_buffer(sync_client, tutor_and_session):
    """Client metrics received via WebSocket are stored in the metrics buffer."""
    from app.websocket.handler import client_metrics_buffer

    _, session, tutor_token, _ = tutor_and_session
    session_id = str(session.id)

    client_metrics_buffer.clear_session(session_id)

    with sync_client.websocket_connect(
        f"/ws/session/{session.id}?token={tutor_token}"
    ) as ws:
        ws.send_json({
            "type": "client_metrics",
            "data": {"eye_contact_score": 0.85, "facial_energy": 0.6},
            "timestamp": 1000,
        })
        ws.send_json({"type": "ping"})

    latest = client_metrics_buffer.get_latest(session_id, "tutor")
    assert latest is not None
    assert latest["eye_contact_score"] == 0.85
    assert latest["facial_energy"] == 0.6
    assert latest["timestamp"] == 1000


def test_client_metrics_null_values_accepted(sync_client, tutor_and_session):
    """Server accepts null metric values (face not detected)."""
    from app.websocket.handler import client_metrics_buffer

    _, session, tutor_token, _ = tutor_and_session
    session_id = str(session.id)

    client_metrics_buffer.clear_session(session_id)

    with sync_client.websocket_connect(
        f"/ws/session/{session.id}?token={tutor_token}"
    ) as ws:
        ws.send_json({
            "type": "client_metrics",
            "data": {"eye_contact_score": None, "facial_energy": None},
            "timestamp": 2000,
        })
        ws.send_json({"type": "ping"})

    latest = client_metrics_buffer.get_latest(session_id, "tutor")
    assert latest is not None
    assert latest["eye_contact_score"] is None
    assert latest["facial_energy"] is None


def test_student_client_metrics_stored_separately(sync_client, tutor_and_session):
    """Student metrics are stored under the student role, separate from tutor."""
    from app.websocket.handler import client_metrics_buffer

    _, session, _, student_token = tutor_and_session
    session_id = str(session.id)

    client_metrics_buffer.clear_session(session_id)

    with sync_client.websocket_connect(
        f"/ws/session/{session.id}?token={student_token}"
    ) as ws:
        ws.send_json({
            "type": "client_metrics",
            "data": {"eye_contact_score": 0.4, "facial_energy": 0.3},
            "timestamp": 1500,
        })
        ws.send_json({"type": "ping"})

    student = client_metrics_buffer.get_latest(session_id, "student")
    assert student is not None
    assert student["eye_contact_score"] == 0.4

    tutor = client_metrics_buffer.get_latest(session_id, "tutor")
    assert tutor is None
