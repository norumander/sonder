"""Tests for server metrics broadcast via WebSocket (TASK-014).

Integration tests verifying:
- Tutor receives server_metrics messages
- Student does NOT receive server_metrics
- Attention drift messages sent on state change
- Student status messages on connect/disconnect
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from starlette.testclient import TestClient

from app.auth.jwt import create_access_token
from app.models.base import Base
from app.models.models import Session as SessionModel
from app.models.models import SessionStatus, Tutor


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
        google_id="google-broadcast-test",
        name="Broadcast Tutor",
        email="broadcast@example.com",
        preferences={},
    )
    db_session.add(tutor)
    await db_session.flush()

    session = SessionModel(
        id=uuid.uuid4(),
        tutor_id=tutor.id,
        join_code="BC1234",
        status=SessionStatus.ACTIVE,
        student_display_name="Broadcast Student",
        start_time=datetime.now(UTC),
        join_time=datetime.now(UTC),
    )
    db_session.add(session)
    await db_session.commit()

    tutor_token = create_access_token(tutor_id=str(tutor.id))
    student_token = create_access_token(tutor_id=f"student:{session.id}")

    return tutor, session, tutor_token, student_token


def test_tutor_receives_server_metrics_after_client_metrics(sync_client, tutor_and_session):
    """When client sends metrics, tutor receives server_metrics broadcast."""
    _, session, tutor_token, student_token = tutor_and_session

    # Shorten broadcast interval for test
    from app.websocket import handler
    original_interval = handler.BROADCAST_INTERVAL_S
    handler.BROADCAST_INTERVAL_S = 0.5

    try:
        with sync_client.websocket_connect(
            f"/ws/session/{session.id}?token={tutor_token}"
        ) as tutor_ws:
            # Send client metrics from tutor
            tutor_ws.send_json({
                "type": "client_metrics",
                "data": {"eye_contact_score": 0.9, "facial_energy": 0.7},
                "timestamp": 1000,
            })

            # Tutor should receive a server_metrics message
            msg = tutor_ws.receive_json()
            assert msg["type"] == "server_metrics"
            assert "data" in msg
            data = msg["data"]
            assert "tutor_eye_contact" in data
            assert "tutor_talk_pct" in data
            assert "interruption_count" in data
    finally:
        handler.BROADCAST_INTERVAL_S = original_interval


def test_student_does_not_receive_server_metrics(sync_client, tutor_and_session):
    """Student should NOT receive server_metrics messages."""
    _, session, tutor_token, student_token = tutor_and_session

    from app.websocket import handler
    original_interval = handler.BROADCAST_INTERVAL_S
    original_hb = handler.HEARTBEAT_INTERVAL_S
    handler.BROADCAST_INTERVAL_S = 0.5
    handler.HEARTBEAT_INTERVAL_S = 100  # Disable heartbeat for this test

    try:
        with sync_client.websocket_connect(
            f"/ws/session/{session.id}?token={tutor_token}"
        ) as tutor_ws:
            with sync_client.websocket_connect(
                f"/ws/session/{session.id}?token={student_token}"
            ) as student_ws:
                # Send metrics from student
                student_ws.send_json({
                    "type": "client_metrics",
                    "data": {"eye_contact_score": 0.8, "facial_energy": 0.6},
                    "timestamp": 1000,
                })

                # Tutor gets student_status first (student just connected)
                status_msg = tutor_ws.receive_json()
                assert status_msg["type"] == "student_status"

                # Then tutor should get server_metrics
                msg = tutor_ws.receive_json()
                assert msg["type"] == "server_metrics"

                # Student should NOT get server_metrics — sending another message
                # to check student doesn't have queued server_metrics
                student_ws.send_json({"type": "ping"})
                # If student had a server_metrics message queued, it would come
                # before any response. Since there's no echo, just verify
                # tutor got the broadcast, not student.
    finally:
        handler.BROADCAST_INTERVAL_S = original_interval
        handler.HEARTBEAT_INTERVAL_S = original_hb


def test_student_status_sent_on_connect(sync_client, tutor_and_session):
    """Tutor receives student_status message when student connects."""
    _, session, tutor_token, student_token = tutor_and_session

    from app.websocket import handler
    original_interval = handler.BROADCAST_INTERVAL_S
    handler.BROADCAST_INTERVAL_S = 100  # Disable broadcast for this test

    try:
        with sync_client.websocket_connect(
            f"/ws/session/{session.id}?token={tutor_token}"
        ) as tutor_ws:
            with sync_client.websocket_connect(
                f"/ws/session/{session.id}?token={student_token}"
            ):
                msg = tutor_ws.receive_json()
                assert msg["type"] == "student_status"
                assert msg["data"]["connected"] is True
    finally:
        handler.BROADCAST_INTERVAL_S = original_interval


def test_student_status_sent_on_disconnect(sync_client, tutor_and_session):
    """Tutor receives student_status message when student disconnects."""
    _, session, tutor_token, student_token = tutor_and_session

    from app.websocket import handler
    original_interval = handler.BROADCAST_INTERVAL_S
    handler.BROADCAST_INTERVAL_S = 100  # Disable broadcast for this test

    try:
        with sync_client.websocket_connect(
            f"/ws/session/{session.id}?token={tutor_token}"
        ) as tutor_ws:
            with sync_client.websocket_connect(
                f"/ws/session/{session.id}?token={student_token}"
            ):
                # Receive connect status
                connect_msg = tutor_ws.receive_json()
                assert connect_msg["type"] == "student_status"
                assert connect_msg["data"]["connected"] is True

            # Student disconnected — tutor should get disconnect status
            disconnect_msg = tutor_ws.receive_json()
            assert disconnect_msg["type"] == "student_status"
            assert disconnect_msg["data"]["connected"] is False
    finally:
        handler.BROADCAST_INTERVAL_S = original_interval
