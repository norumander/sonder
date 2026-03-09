"""Tests for GET /sessions/{id}/summary endpoint."""

import uuid
from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.auth.jwt import create_access_token
from app.models.base import Base
from app.models.models import (
    MetricSnapshot,
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
        google_id="g-summary-test",
        name="Summary Tutor",
        email="summary@test.com",
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
async def completed_session(db_session, tutor):
    """Create a completed session with metric snapshots."""
    session = Session(
        id=uuid.uuid4(),
        tutor_id=tutor.id,
        join_code="SUM123",
        status=SessionStatus.COMPLETED,
        session_type=SessionType.LIVE,
        start_time=datetime(2026, 3, 9, 10, 0, tzinfo=UTC),
        end_time=datetime(2026, 3, 9, 10, 30, tzinfo=UTC),
    )
    db_session.add(session)

    for i in range(5):
        snap = MetricSnapshot(
            id=uuid.uuid4(),
            session_id=session.id,
            timestamp_ms=1000 * i,
            metrics={
                "tutor_eye_contact": 0.8,
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

    await db_session.commit()
    return session


@pytest.mark.asyncio
async def test_get_summary_returns_generated_summary(client, tutor_token, completed_session):
    """GET /sessions/{id}/summary generates and returns summary."""
    response = await client.get(
        f"/sessions/{completed_session.id}/summary",
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    assert response.status_code == 200
    data = response.json()

    assert "tutor_metrics" in data
    assert "student_metrics" in data
    assert "talk_time_ratio" in data
    assert "total_interruptions" in data
    assert "interruption_attribution" in data
    assert "flagged_moments" in data
    assert "recommendations" in data
    assert "overall_engagement_score" in data
    assert data["total_interruptions"] == 4  # last snapshot's cumulative
    assert 0 <= data["overall_engagement_score"] <= 100


@pytest.mark.asyncio
async def test_get_summary_returns_existing_if_already_generated(
    client, tutor_token, completed_session, db_session
):
    """GET /sessions/{id}/summary returns existing summary without regenerating."""
    # Pre-create summary
    summary = SessionSummary(
        id=uuid.uuid4(),
        session_id=completed_session.id,
        tutor_metrics={"eye_contact": {"avg": 0.9}},
        student_metrics={"eye_contact": {"avg": 0.7}},
        talk_time_ratio={"tutor_pct": 55.0, "student_pct": 45.0},
        total_interruptions=2,
        interruption_attribution={"tutor_count": 1, "student_count": 1},
        flagged_moments=[],
        recommendations=["Good job!"],
        overall_engagement_score=85.0,
    )
    db_session.add(summary)
    await db_session.commit()

    response = await client.get(
        f"/sessions/{completed_session.id}/summary",
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    # Should return the pre-existing summary, not regenerate
    assert data["overall_engagement_score"] == 85.0
    assert data["total_interruptions"] == 2


@pytest.mark.asyncio
async def test_get_summary_requires_auth(client, completed_session):
    """GET /sessions/{id}/summary without auth returns 401."""
    response = await client.get(f"/sessions/{completed_session.id}/summary")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_summary_not_found(client, tutor_token):
    """GET /sessions/{bad-id}/summary returns 404."""
    fake_id = uuid.uuid4()
    response = await client.get(
        f"/sessions/{fake_id}/summary",
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    assert response.status_code == 404
