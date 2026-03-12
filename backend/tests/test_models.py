"""Tests for database models — TDD Red phase for TASK-001."""

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.base import Base
from app.models.models import (
    MetricSnapshot,
    Nudge,
    NudgePriority,
    NudgeType,
    Session,
    SessionStatus,
    SessionSummary,
    SessionType,
    Tutor,
)


@pytest.fixture
async def async_session():
    """Create an in-memory SQLite async session for testing."""
    engine = create_async_engine("sqlite+aiosqlite://", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


# --- Tutor Model Tests ---


async def test_create_tutor_and_query(async_session: AsyncSession):
    """Create a Tutor record and query it back."""
    tutor = Tutor(
        id=uuid.uuid4(),
        google_id="google-123",
        name="Test Tutor",
        email="tutor@example.com",
        avatar_url="https://example.com/avatar.png",
        preferences={"nudge_thresholds": {}, "enabled_nudges": []},
    )
    async_session.add(tutor)
    await async_session.commit()

    result = await async_session.execute(select(Tutor).where(Tutor.google_id == "google-123"))
    fetched = result.scalar_one()
    assert fetched.name == "Test Tutor"
    assert fetched.email == "tutor@example.com"
    assert fetched.preferences == {"nudge_thresholds": {}, "enabled_nudges": []}
    assert fetched.created_at is not None
    assert fetched.updated_at is not None


async def test_tutor_google_id_is_unique(async_session: AsyncSession):
    """Two tutors with the same google_id should violate uniqueness."""
    t1 = Tutor(id=uuid.uuid4(), google_id="dup-id", name="A", email="a@x.com")
    t2 = Tutor(id=uuid.uuid4(), google_id="dup-id", name="B", email="b@x.com")
    async_session.add(t1)
    await async_session.commit()
    async_session.add(t2)
    with pytest.raises(Exception):  # IntegrityError
        await async_session.commit()


async def test_tutor_default_preferences(async_session: AsyncSession):
    """Tutor preferences default to empty dict."""
    tutor = Tutor(id=uuid.uuid4(), google_id="g-456", name="T", email="t@x.com")
    async_session.add(tutor)
    await async_session.commit()

    result = await async_session.execute(select(Tutor).where(Tutor.google_id == "g-456"))
    fetched = result.scalar_one()
    assert fetched.preferences == {}


# --- Session Model Tests ---


async def test_create_session_with_join_code(async_session: AsyncSession):
    """Create a Session linked to a Tutor with a join code."""
    tutor = Tutor(id=uuid.uuid4(), google_id="g-session", name="T", email="t@x.com")
    async_session.add(tutor)
    await async_session.commit()

    session = Session(
        id=uuid.uuid4(),
        tutor_id=tutor.id,
        join_code="ABC123",
        status=SessionStatus.WAITING,
        session_type=SessionType.LIVE,
        start_time=datetime.now(UTC),
    )
    async_session.add(session)
    await async_session.commit()

    result = await async_session.execute(select(Session).where(Session.join_code == "ABC123"))
    fetched = result.scalar_one()
    assert fetched.status == SessionStatus.WAITING
    assert fetched.session_type == SessionType.LIVE
    assert fetched.tutor_id == tutor.id
    assert fetched.student_display_name is None
    assert fetched.end_time is None


async def test_session_status_enum_values(async_session: AsyncSession):
    """Session status enum has the required values."""
    assert SessionStatus.WAITING.value == "waiting"
    assert SessionStatus.ACTIVE.value == "active"
    assert SessionStatus.COMPLETED.value == "completed"


async def test_session_type_enum_values(async_session: AsyncSession):
    """Session type enum has the required values."""
    assert SessionType.LIVE.value == "live"
    assert SessionType.PRE_RECORDED.value == "pre_recorded"


# --- MetricSnapshot Tests ---


async def test_create_metric_snapshot_with_jsonb(async_session: AsyncSession):
    """Create a MetricSnapshot with JSONB metrics data."""
    tutor = Tutor(id=uuid.uuid4(), google_id="g-ms", name="T", email="t@x.com")
    async_session.add(tutor)
    await async_session.commit()

    session = Session(
        id=uuid.uuid4(),
        tutor_id=tutor.id,
        join_code="MET001",
        status=SessionStatus.ACTIVE,
        session_type=SessionType.LIVE,
        start_time=datetime.now(UTC),
    )
    async_session.add(session)
    await async_session.commit()

    metrics_data = {
        "tutor_eye_contact": 0.85,
        "student_eye_contact": 0.72,
        "tutor_talk_pct": 0.6,
        "student_talk_pct": 0.4,
        "interruption_count": 2,
        "tutor_energy": 0.7,
        "student_energy": 0.5,
        "tutor_attention_drift": False,
        "student_attention_drift": False,
        "drift_reason": None,
    }
    snapshot = MetricSnapshot(
        id=uuid.uuid4(),
        session_id=session.id,
        timestamp_ms=5000,
        metrics=metrics_data,
    )
    async_session.add(snapshot)
    await async_session.commit()

    result = await async_session.execute(
        select(MetricSnapshot).where(MetricSnapshot.session_id == session.id)
    )
    fetched = result.scalar_one()
    assert fetched.timestamp_ms == 5000
    assert fetched.metrics["tutor_eye_contact"] == 0.85
    assert fetched.metrics["student_energy"] == 0.5


# --- Nudge Tests ---


async def test_create_nudge_with_type_and_priority(async_session: AsyncSession):
    """Create a Nudge with enum type and priority, plus trigger metrics."""
    tutor = Tutor(id=uuid.uuid4(), google_id="g-nudge", name="T", email="t@x.com")
    async_session.add(tutor)
    await async_session.commit()

    session = Session(
        id=uuid.uuid4(),
        tutor_id=tutor.id,
        join_code="NDG001",
        status=SessionStatus.ACTIVE,
        session_type=SessionType.LIVE,
        start_time=datetime.now(UTC),
    )
    async_session.add(session)
    await async_session.commit()

    nudge = Nudge(
        id=uuid.uuid4(),
        session_id=session.id,
        timestamp_ms=30000,
        nudge_type=NudgeType.STUDENT_SILENT,
        message="Student hasn't spoken — check for understanding",
        priority=NudgePriority.MEDIUM,
        trigger_metrics={"student_talk_pct": 0.0, "silence_duration_s": 185},
    )
    async_session.add(nudge)
    await async_session.commit()

    result = await async_session.execute(select(Nudge).where(Nudge.session_id == session.id))
    fetched = result.scalar_one()
    assert fetched.nudge_type == NudgeType.STUDENT_SILENT
    assert fetched.priority == NudgePriority.MEDIUM
    assert fetched.message == "Student hasn't spoken — check for understanding"
    assert fetched.trigger_metrics["silence_duration_s"] == 185


async def test_nudge_type_enum_values():
    """NudgeType enum has all 6 required values."""
    assert NudgeType.STUDENT_SILENT.value == "student_silent"
    assert NudgeType.STUDENT_LOW_EYE_CONTACT.value == "student_low_eye_contact"
    assert NudgeType.TUTOR_DOMINANT.value == "tutor_dominant"
    assert NudgeType.STUDENT_ENERGY_DROP.value == "student_energy_drop"
    assert NudgeType.INTERRUPTION_SPIKE.value == "interruption_spike"
    assert NudgeType.TUTOR_LOW_EYE_CONTACT.value == "tutor_low_eye_contact"


async def test_nudge_priority_enum_values():
    """NudgePriority enum has low, medium, high."""
    assert NudgePriority.LOW.value == "low"
    assert NudgePriority.MEDIUM.value == "medium"
    assert NudgePriority.HIGH.value == "high"


# --- SessionSummary Tests ---


async def test_create_session_summary(async_session: AsyncSession):
    """Create a SessionSummary with all JSONB fields."""
    tutor = Tutor(id=uuid.uuid4(), google_id="g-sum", name="T", email="t@x.com")
    async_session.add(tutor)
    await async_session.commit()

    session = Session(
        id=uuid.uuid4(),
        tutor_id=tutor.id,
        join_code="SUM001",
        status=SessionStatus.COMPLETED,
        session_type=SessionType.LIVE,
        start_time=datetime.now(UTC),
    )
    async_session.add(session)
    await async_session.commit()

    summary = SessionSummary(
        id=uuid.uuid4(),
        session_id=session.id,
        tutor_metrics={"eye_contact": {"avg": 0.8, "min": 0.5, "max": 0.95}},
        student_metrics={"eye_contact": {"avg": 0.6, "min": 0.2, "max": 0.9}},
        talk_time_ratio={"tutor_pct": 0.55, "student_pct": 0.45},
        total_interruptions=5,
        interruption_attribution={"tutor_count": 2, "student_count": 3},
        flagged_moments=[
            {"timestamp_ms": 10000, "participant": "student", "type": "attention_drift"}
        ],
        recommendations=["Ask more open-ended questions", "Reduce talk time"],
        overall_engagement_score=72.5,
    )
    async_session.add(summary)
    await async_session.commit()

    result = await async_session.execute(
        select(SessionSummary).where(SessionSummary.session_id == session.id)
    )
    fetched = result.scalar_one()
    assert fetched.tutor_metrics["eye_contact"]["avg"] == 0.8
    assert fetched.student_metrics["eye_contact"]["min"] == 0.2
    assert fetched.talk_time_ratio["tutor_pct"] == 0.55
    assert fetched.total_interruptions == 5
    assert len(fetched.flagged_moments) == 1
    assert len(fetched.recommendations) == 2
    assert fetched.overall_engagement_score == 72.5


# --- Relationship Tests ---


async def test_tutor_has_many_sessions(async_session: AsyncSession):
    """A Tutor can have multiple Sessions."""
    tutor = Tutor(id=uuid.uuid4(), google_id="g-rel", name="T", email="t@x.com")
    async_session.add(tutor)
    await async_session.commit()

    for i in range(3):
        s = Session(
            id=uuid.uuid4(),
            tutor_id=tutor.id,
            join_code=f"REL00{i}",
            status=SessionStatus.WAITING,
            session_type=SessionType.LIVE,
            start_time=datetime.now(UTC),
        )
        async_session.add(s)
    await async_session.commit()

    result = await async_session.execute(select(Session).where(Session.tutor_id == tutor.id))
    sessions = result.scalars().all()
    assert len(sessions) == 3
