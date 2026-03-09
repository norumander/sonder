"""Tests for analytics endpoints: GET /sessions/{id}/snapshots and GET /sessions/{id}/nudges."""

import uuid
from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.auth.jwt import create_access_token
from app.models.base import Base
from app.models.models import (
    MetricSnapshot,
    Nudge,
    NudgePriority,
    NudgeType,
    Session,
    SessionStatus,
    SessionType,
    Tutor,
)


@pytest.fixture
async def db_session():
    """In-memory SQLite async session."""
    engine = create_async_engine("sqlite+aiosqlite://", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def tutor(db_session):
    """Create a test tutor."""
    t = Tutor(
        id=uuid.uuid4(),
        google_id="g-analytics-test",
        name="Analytics Tutor",
        email="analytics@test.com",
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest.fixture
async def tutor_token(tutor):
    """JWT for the test tutor."""
    return create_access_token(tutor_id=str(tutor.id))


@pytest.fixture
async def test_app(db_session):
    """FastAPI app with DB override."""
    from app.database import get_db
    from app.main import app

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    yield app
    app.dependency_overrides.clear()


@pytest.fixture
async def client(test_app):
    """Async HTTP test client."""
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def session_with_data(db_session, tutor):
    """Create a completed session with snapshots and nudges."""
    session = Session(
        id=uuid.uuid4(),
        tutor_id=tutor.id,
        join_code="ANA123",
        status=SessionStatus.COMPLETED,
        session_type=SessionType.LIVE,
        student_display_name="Test Student",
        start_time=datetime(2026, 3, 9, 10, 0, tzinfo=UTC),
        end_time=datetime(2026, 3, 9, 10, 30, tzinfo=UTC),
    )
    db_session.add(session)

    # Add 3 snapshots
    for i in range(3):
        snap = MetricSnapshot(
            id=uuid.uuid4(),
            session_id=session.id,
            timestamp_ms=1000 * i,
            metrics={
                "tutor_eye_contact": 0.8 - i * 0.1,
                "student_eye_contact": 0.6,
                "tutor_talk_pct": 55.0,
                "student_talk_pct": 45.0,
                "interruption_count": i,
                "tutor_energy": 0.7,
                "student_energy": 0.5,
                "tutor_attention_drift": False,
                "student_attention_drift": False,
                "drift_reason": None,
            },
        )
        db_session.add(snap)

    # Add 2 nudges
    nudge1 = Nudge(
        id=uuid.uuid4(),
        session_id=session.id,
        timestamp_ms=500,
        nudge_type=NudgeType.STUDENT_SILENT,
        message="Your student has been quiet. Try asking an open-ended question.",
        priority=NudgePriority.MEDIUM,
        trigger_metrics={"student_talk_pct": 5.0},
    )
    nudge2 = Nudge(
        id=uuid.uuid4(),
        session_id=session.id,
        timestamp_ms=1500,
        nudge_type=NudgeType.TUTOR_DOMINANT,
        message="You've been talking a lot. Pause and let your student respond.",
        priority=NudgePriority.HIGH,
        trigger_metrics={"tutor_talk_pct": 85.0},
    )
    db_session.add(nudge1)
    db_session.add(nudge2)

    await db_session.commit()
    return session


# --- GET /sessions/{id}/snapshots ---


@pytest.mark.asyncio
async def test_get_snapshots_returns_ordered_time_series(
    client, tutor_token, session_with_data
):
    """GET /sessions/{id}/snapshots returns snapshots ordered by timestamp_ms."""
    response = await client.get(
        f"/sessions/{session_with_data.id}/snapshots",
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    assert response.status_code == 200
    data = response.json()

    assert "snapshots" in data
    assert len(data["snapshots"]) == 3

    # Verify ordering by timestamp
    timestamps = [s["timestamp_ms"] for s in data["snapshots"]]
    assert timestamps == [0, 1000, 2000]

    # Verify snapshot structure
    first = data["snapshots"][0]
    assert "timestamp_ms" in first
    assert "metrics" in first
    assert first["metrics"]["tutor_eye_contact"] == 0.8


@pytest.mark.asyncio
async def test_get_snapshots_requires_auth(client, session_with_data):
    """GET /sessions/{id}/snapshots without auth returns 401."""
    response = await client.get(f"/sessions/{session_with_data.id}/snapshots")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_snapshots_not_found(client, tutor_token):
    """GET /sessions/{bad-id}/snapshots returns 404."""
    fake_id = uuid.uuid4()
    response = await client.get(
        f"/sessions/{fake_id}/snapshots",
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_snapshots_empty_session(client, tutor_token, db_session, tutor):
    """GET /sessions/{id}/snapshots for session with no snapshots returns empty list."""
    session = Session(
        id=uuid.uuid4(),
        tutor_id=tutor.id,
        join_code="EMP123",
        status=SessionStatus.COMPLETED,
        session_type=SessionType.LIVE,
        start_time=datetime(2026, 3, 9, 10, 0, tzinfo=UTC),
    )
    db_session.add(session)
    await db_session.commit()

    response = await client.get(
        f"/sessions/{session.id}/snapshots",
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    assert response.status_code == 200
    assert response.json()["snapshots"] == []


# --- GET /sessions/{id}/nudges ---


@pytest.mark.asyncio
async def test_get_nudges_returns_ordered_list(
    client, tutor_token, session_with_data
):
    """GET /sessions/{id}/nudges returns nudges ordered by timestamp_ms."""
    response = await client.get(
        f"/sessions/{session_with_data.id}/nudges",
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    assert response.status_code == 200
    data = response.json()

    assert "nudges" in data
    assert len(data["nudges"]) == 2

    # Verify ordering
    assert data["nudges"][0]["timestamp_ms"] == 500
    assert data["nudges"][1]["timestamp_ms"] == 1500

    # Verify nudge structure
    first = data["nudges"][0]
    assert first["nudge_type"] == "student_silent"
    assert first["message"] == "Your student has been quiet. Try asking an open-ended question."
    assert first["priority"] == "medium"


@pytest.mark.asyncio
async def test_get_nudges_requires_auth(client, session_with_data):
    """GET /sessions/{id}/nudges without auth returns 401."""
    response = await client.get(f"/sessions/{session_with_data.id}/nudges")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_nudges_not_found(client, tutor_token):
    """GET /sessions/{bad-id}/nudges returns 404."""
    fake_id = uuid.uuid4()
    response = await client.get(
        f"/sessions/{fake_id}/nudges",
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    assert response.status_code == 404
