"""Tests for GET /tutor/trends endpoint — cross-session trend analysis."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.auth.jwt import create_access_token
from app.models.base import Base
from app.models.models import (
    Session,
    SessionStatus,
    SessionSummary,
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
        google_id="g-trends-test",
        name="Trends Tutor",
        email="trends@test.com",
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


async def _create_session_with_summary(
    db_session,
    tutor,
    *,
    days_ago: int,
    join_code: str,
    tutor_eye_contact_avg: float = 0.8,
    student_eye_contact_avg: float = 0.6,
    tutor_energy_avg: float = 0.7,
    student_energy_avg: float = 0.5,
    tutor_talk_pct: float = 55.0,
    student_talk_pct: float = 45.0,
    total_interruptions: int = 3,
    engagement_score: float = 75.0,
):
    """Helper to create a completed session with a summary."""
    base_time = datetime(2026, 3, 9, 10, 0, tzinfo=UTC) - timedelta(days=days_ago)
    session = Session(
        id=uuid.uuid4(),
        tutor_id=tutor.id,
        join_code=join_code,
        status=SessionStatus.COMPLETED,
        session_type=SessionType.LIVE,
        start_time=base_time,
        end_time=base_time + timedelta(minutes=30),
    )
    db_session.add(session)

    summary = SessionSummary(
        id=uuid.uuid4(),
        session_id=session.id,
        tutor_metrics={
            "eye_contact": {"avg": tutor_eye_contact_avg, "min": 0.5, "max": 1.0},
            "energy": {"avg": tutor_energy_avg, "min": 0.4, "max": 0.9},
        },
        student_metrics={
            "eye_contact": {"avg": student_eye_contact_avg, "min": 0.3, "max": 0.9},
            "energy": {"avg": student_energy_avg, "min": 0.2, "max": 0.8},
        },
        talk_time_ratio={"tutor_pct": tutor_talk_pct, "student_pct": student_talk_pct},
        total_interruptions=total_interruptions,
        interruption_attribution={"tutor_count": 1, "student_count": 2},
        flagged_moments=[],
        recommendations=["Keep it up!"],
        overall_engagement_score=engagement_score,
    )
    db_session.add(summary)
    await db_session.commit()
    return session


# --- GET /tutor/trends ---


@pytest.mark.asyncio
async def test_trends_returns_per_session_averages(client, tutor_token, db_session, tutor):
    """GET /tutor/trends returns per-session averages for both participants."""
    await _create_session_with_summary(
        db_session, tutor, days_ago=2, join_code="TR0001",
        tutor_eye_contact_avg=0.8, student_eye_contact_avg=0.6,
        tutor_energy_avg=0.7, student_energy_avg=0.5,
        engagement_score=75.0,
    )
    await _create_session_with_summary(
        db_session, tutor, days_ago=1, join_code="TR0002",
        tutor_eye_contact_avg=0.9, student_eye_contact_avg=0.7,
        tutor_energy_avg=0.8, student_energy_avg=0.6,
        engagement_score=85.0,
    )

    response = await client.get(
        "/tutor/trends",
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    assert response.status_code == 200
    data = response.json()

    assert "sessions" in data
    assert len(data["sessions"]) == 2

    # Sessions ordered by date ascending (oldest first) for chart x-axis
    first = data["sessions"][0]
    second = data["sessions"][1]

    # Verify structure
    assert "session_id" in first
    assert "start_time" in first
    assert "tutor_eye_contact" in first
    assert "student_eye_contact" in first
    assert "tutor_energy" in first
    assert "student_energy" in first
    assert "tutor_talk_pct" in first
    assert "student_talk_pct" in first
    assert "total_interruptions" in first
    assert "engagement_score" in first

    # Verify values (oldest session first)
    assert first["tutor_eye_contact"] == 0.8
    assert first["student_eye_contact"] == 0.6
    assert first["engagement_score"] == 75.0
    assert second["tutor_eye_contact"] == 0.9
    assert second["engagement_score"] == 85.0


@pytest.mark.asyncio
async def test_trends_limits_to_10_sessions(client, tutor_token, db_session, tutor):
    """GET /tutor/trends returns at most 10 most recent sessions."""
    for i in range(12):
        await _create_session_with_summary(
            db_session, tutor, days_ago=12 - i, join_code=f"TL{i:04d}",
            engagement_score=50.0 + i,
        )

    response = await client.get(
        "/tutor/trends",
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    assert response.status_code == 200
    data = response.json()

    assert len(data["sessions"]) == 10
    # Should be the 10 most recent, ordered ascending (oldest of the 10 first)
    scores = [s["engagement_score"] for s in data["sessions"]]
    assert scores[0] == 52.0  # days_ago=10 (index 2)
    assert scores[-1] == 61.0  # days_ago=1 (index 11)


@pytest.mark.asyncio
async def test_trends_empty_returns_empty_list(client, tutor_token):
    """GET /tutor/trends with 0 sessions returns empty sessions list."""
    response = await client.get(
        "/tutor/trends",
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["sessions"] == []


@pytest.mark.asyncio
async def test_trends_one_session_returns_one_datapoint(client, tutor_token, db_session, tutor):
    """GET /tutor/trends with 1 session returns 1 data point."""
    await _create_session_with_summary(
        db_session, tutor, days_ago=0, join_code="TS0001",
        engagement_score=70.0,
    )

    response = await client.get(
        "/tutor/trends",
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    assert response.status_code == 200
    assert len(response.json()["sessions"]) == 1


@pytest.mark.asyncio
async def test_trends_excludes_sessions_without_summary(client, tutor_token, db_session, tutor):
    """Sessions without summaries are excluded from trends."""
    # Session with summary
    await _create_session_with_summary(
        db_session, tutor, days_ago=1, join_code="TE0001",
    )

    # Session without summary (just a session, no SessionSummary row)
    session_no_summary = Session(
        id=uuid.uuid4(),
        tutor_id=tutor.id,
        join_code="TE0002",
        status=SessionStatus.COMPLETED,
        session_type=SessionType.LIVE,
        start_time=datetime(2026, 3, 9, 10, 0, tzinfo=UTC),
    )
    db_session.add(session_no_summary)
    await db_session.commit()

    response = await client.get(
        "/tutor/trends",
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    assert response.status_code == 200
    assert len(response.json()["sessions"]) == 1


@pytest.mark.asyncio
async def test_trends_requires_auth(client):
    """GET /tutor/trends without auth returns 401."""
    response = await client.get("/tutor/trends")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_trends_only_returns_own_sessions(client, tutor_token, db_session, tutor):
    """Tutor only sees trends for their own sessions."""
    # Own session
    await _create_session_with_summary(
        db_session, tutor, days_ago=1, join_code="TO0001",
    )

    # Another tutor's session
    other_tutor = Tutor(
        id=uuid.uuid4(),
        google_id="g-other-trends",
        name="Other Tutor",
        email="other@test.com",
    )
    db_session.add(other_tutor)
    await db_session.commit()

    await _create_session_with_summary(
        db_session, other_tutor, days_ago=1, join_code="TO0002",
    )

    response = await client.get(
        "/tutor/trends",
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    assert response.status_code == 200
    assert len(response.json()["sessions"]) == 1
