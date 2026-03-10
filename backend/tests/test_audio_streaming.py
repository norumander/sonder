"""Tests for audio chunk streaming from client to server via WebSocket."""

from __future__ import annotations

import base64
import struct

import pytest

from app.audio.buffer import AudioChunkBuffer


class TestAudioChunkBuffer:
    """Unit tests for the in-memory audio chunk buffer."""

    def test_store_and_retrieve_chunk(self):
        buf = AudioChunkBuffer()
        pcm_data = base64.b64encode(b"\x00\x01\x02\x03").decode()
        buf.add_chunk("session-1", "tutor", pcm_data, timestamp=1000)

        chunks = buf.get_chunks("session-1", "tutor")
        assert len(chunks) == 1
        assert chunks[0]["data"] == pcm_data
        assert chunks[0]["timestamp"] == 1000

    def test_chunks_stored_per_role(self):
        buf = AudioChunkBuffer()
        buf.add_chunk("session-1", "tutor", "dHV0b3I=", timestamp=1000)
        buf.add_chunk("session-1", "student", "c3R1ZGVudA==", timestamp=1000)

        tutor_chunks = buf.get_chunks("session-1", "tutor")
        student_chunks = buf.get_chunks("session-1", "student")
        assert len(tutor_chunks) == 1
        assert len(student_chunks) == 1
        assert tutor_chunks[0]["data"] != student_chunks[0]["data"]

    def test_chunks_stored_per_session(self):
        buf = AudioChunkBuffer()
        buf.add_chunk("session-1", "tutor", "czE=", timestamp=1000)
        buf.add_chunk("session-2", "tutor", "czI=", timestamp=1000)

        assert len(buf.get_chunks("session-1", "tutor")) == 1
        assert len(buf.get_chunks("session-2", "tutor")) == 1

    def test_consume_chunks_clears_buffer(self):
        buf = AudioChunkBuffer()
        buf.add_chunk("session-1", "tutor", "ZGF0YQ==", timestamp=1000)
        buf.add_chunk("session-1", "tutor", "ZGF0YTI=", timestamp=2000)

        consumed = buf.consume_chunks("session-1", "tutor")
        assert len(consumed) == 2
        assert len(buf.get_chunks("session-1", "tutor")) == 0

    def test_get_chunks_empty_session_returns_empty(self):
        buf = AudioChunkBuffer()
        assert buf.get_chunks("nonexistent", "tutor") == []

    def test_clear_session_removes_all_roles(self):
        buf = AudioChunkBuffer()
        buf.add_chunk("session-1", "tutor", "ZGF0YQ==", timestamp=1000)
        buf.add_chunk("session-1", "student", "ZGF0YQ==", timestamp=1000)

        buf.clear_session("session-1")
        assert buf.get_chunks("session-1", "tutor") == []
        assert buf.get_chunks("session-1", "student") == []

    def test_chunks_preserve_order(self):
        buf = AudioChunkBuffer()
        for i in range(5):
            buf.add_chunk("session-1", "tutor", f"chunk{i}", timestamp=i * 1000)

        chunks = buf.get_chunks("session-1", "tutor")
        timestamps = [c["timestamp"] for c in chunks]
        assert timestamps == [0, 1000, 2000, 3000, 4000]


# --- Integration test fixtures (same pattern as test_websocket.py) ---

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from starlette.testclient import TestClient

from app.auth.jwt import create_access_token, create_student_token
from app.models.base import Base
from app.models.models import Session as SessionModel
from app.models.models import SessionStatus, Tutor


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
        google_id="google-audio-test",
        name="Audio Tutor",
        email="audio@example.com",
        preferences={},
    )
    db_session.add(tutor)
    await db_session.flush()

    session = SessionModel(
        id=uuid.uuid4(),
        tutor_id=tutor.id,
        join_code="AUD123",
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


def test_audio_chunk_message_accepted(sync_client, tutor_and_session):
    """Server accepts audio_chunk messages without error."""
    _, session, tutor_token, _ = tutor_and_session
    pcm_bytes = struct.pack("<4h", 0, 100, -100, 50)
    b64_data = base64.b64encode(pcm_bytes).decode()

    with sync_client.websocket_connect(
        f"/ws/session/{session.id}?token={tutor_token}"
    ) as ws:
        ws.send_json({
            "type": "audio_chunk",
            "data": b64_data,
            "timestamp": 1000,
        })
        # Send a follow-up to verify connection is still alive
        ws.send_json({"type": "ping"})


def test_audio_chunk_stored_in_buffer(sync_client, tutor_and_session):
    """Audio chunks received via WebSocket are stored in the audio buffer."""
    from app.websocket.handler import audio_buffer

    _, session, tutor_token, _ = tutor_and_session
    session_id = str(session.id)
    pcm_bytes = struct.pack("<4h", 0, 100, -100, 50)
    b64_data = base64.b64encode(pcm_bytes).decode()

    # Clear any prior state
    audio_buffer.clear_session(session_id)

    with sync_client.websocket_connect(
        f"/ws/session/{session.id}?token={tutor_token}"
    ) as ws:
        ws.send_json({
            "type": "audio_chunk",
            "data": b64_data,
            "timestamp": 1000,
        })
        # Follow-up ensures the audio_chunk was processed
        ws.send_json({"type": "ping"})

        # Check buffer while connection is open (tutor disconnect clears it)
        chunks = audio_buffer.get_chunks(session_id, "tutor")
        assert len(chunks) >= 1
        assert chunks[0]["data"] == b64_data
        assert chunks[0]["timestamp"] == 1000
