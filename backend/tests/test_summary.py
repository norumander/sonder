"""Tests for post-session summary generation."""

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
from app.summary.generator import _compute_recommendations, generate_summary


@pytest.fixture
async def db_session():
    """Create an in-memory SQLite async session for testing."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session

    await engine.dispose()


@pytest.fixture
async def sample_session(db_session: AsyncSession):
    """Create a tutor and session with metric snapshots and nudges."""
    tutor = Tutor(
        id=uuid.uuid4(),
        google_id="g-123",
        name="Test Tutor",
        email="tutor@test.com",
        preferences={},
    )
    db_session.add(tutor)

    session = Session(
        id=uuid.uuid4(),
        tutor_id=tutor.id,
        join_code="ABC123",
        status=SessionStatus.COMPLETED,
        session_type=SessionType.LIVE,
        start_time=datetime(2026, 3, 9, 10, 0, tzinfo=UTC),
        join_time=datetime(2026, 3, 9, 10, 1, tzinfo=UTC),
        end_time=datetime(2026, 3, 9, 10, 30, tzinfo=UTC),
    )
    db_session.add(session)

    # Add metric snapshots simulating a 30-minute session
    snapshots = [
        {
            "timestamp_ms": 1000 * i,
            "metrics": {
                "tutor_eye_contact": 0.8,
                "student_eye_contact": 0.6,
                "tutor_talk_pct": 65.0,
                "student_talk_pct": 35.0,
                "interruption_count": i // 5,  # cumulative
                "tutor_energy": 0.7,
                "student_energy": 0.5,
                "tutor_attention_drift": False,
                "student_attention_drift": False,
                "drift_reason": None,
            },
        }
        for i in range(10)
    ]
    for snap_data in snapshots:
        snap = MetricSnapshot(
            id=uuid.uuid4(),
            session_id=session.id,
            timestamp_ms=snap_data["timestamp_ms"],
            metrics=snap_data["metrics"],
        )
        db_session.add(snap)

    # Add a nudge
    nudge = Nudge(
        id=uuid.uuid4(),
        session_id=session.id,
        timestamp_ms=3000,
        nudge_type=NudgeType.TUTOR_DOMINANT,
        message="You've been talking for a while. Try asking a question.",
        priority=NudgePriority.MEDIUM,
        trigger_metrics={"tutor_talk_pct": 65.0},
    )
    db_session.add(nudge)

    await db_session.commit()
    return session


@pytest.fixture
async def session_with_varied_metrics(db_session: AsyncSession):
    """Create a session with varied metrics for min/max testing."""
    tutor = Tutor(
        id=uuid.uuid4(),
        google_id="g-456",
        name="Varied Tutor",
        email="varied@test.com",
        preferences={},
    )
    db_session.add(tutor)

    session = Session(
        id=uuid.uuid4(),
        tutor_id=tutor.id,
        join_code="VAR123",
        status=SessionStatus.COMPLETED,
        session_type=SessionType.LIVE,
        start_time=datetime(2026, 3, 9, 10, 0, tzinfo=UTC),
        end_time=datetime(2026, 3, 9, 10, 30, tzinfo=UTC),
    )
    db_session.add(session)

    # Varied metric data
    metrics_list = [
        {"tutor_eye_contact": 0.9, "student_eye_contact": 0.2,
         "tutor_talk_pct": 80.0, "student_talk_pct": 20.0,
         "interruption_count": 0, "tutor_energy": 0.9, "student_energy": 0.3,
         "tutor_attention_drift": False, "student_attention_drift": True,
         "drift_reason": "low_eye_contact"},
        {"tutor_eye_contact": 0.5, "student_eye_contact": 0.8,
         "tutor_talk_pct": 70.0, "student_talk_pct": 30.0,
         "interruption_count": 1, "tutor_energy": 0.4, "student_energy": 0.7,
         "tutor_attention_drift": False, "student_attention_drift": False,
         "drift_reason": None},
        {"tutor_eye_contact": 0.3, "student_eye_contact": 0.5,
         "tutor_talk_pct": 60.0, "student_talk_pct": 40.0,
         "interruption_count": 3, "tutor_energy": 0.6, "student_energy": 0.5,
         "tutor_attention_drift": True, "student_attention_drift": False,
         "drift_reason": "energy_drop"},
    ]

    for i, m in enumerate(metrics_list):
        snap = MetricSnapshot(
            id=uuid.uuid4(),
            session_id=session.id,
            timestamp_ms=1000 * i,
            metrics=m,
        )
        db_session.add(snap)

    # Add drift nudge
    nudge = Nudge(
        id=uuid.uuid4(),
        session_id=session.id,
        timestamp_ms=2000,
        nudge_type=NudgeType.STUDENT_LOW_EYE_CONTACT,
        message="Student may be distracted.",
        priority=NudgePriority.HIGH,
        trigger_metrics={"student_eye_contact": 0.2},
    )
    db_session.add(nudge)

    await db_session.commit()
    return session


@pytest.fixture
async def empty_session(db_session: AsyncSession):
    """Create a session with no metric snapshots."""
    tutor = Tutor(
        id=uuid.uuid4(),
        google_id="g-empty",
        name="Empty Tutor",
        email="empty@test.com",
        preferences={},
    )
    db_session.add(tutor)

    session = Session(
        id=uuid.uuid4(),
        tutor_id=tutor.id,
        join_code="EMP123",
        status=SessionStatus.COMPLETED,
        session_type=SessionType.LIVE,
        start_time=datetime(2026, 3, 9, 10, 0, tzinfo=UTC),
        end_time=datetime(2026, 3, 9, 10, 5, tzinfo=UTC),
    )
    db_session.add(session)
    await db_session.commit()
    return session


# --- Tests ---


@pytest.mark.asyncio
async def test_generate_summary_computes_tutor_metrics(db_session, sample_session):
    """Summary includes avg/min/max for tutor eye contact, energy."""
    summary = await generate_summary(sample_session.id, db_session)

    assert summary is not None
    tutor = summary.tutor_metrics
    assert tutor["eye_contact"]["avg"] == pytest.approx(0.8)
    assert tutor["eye_contact"]["min"] == pytest.approx(0.8)
    assert tutor["eye_contact"]["max"] == pytest.approx(0.8)
    assert tutor["energy"]["avg"] == pytest.approx(0.7)


@pytest.mark.asyncio
async def test_generate_summary_computes_student_metrics(db_session, sample_session):
    """Summary includes avg/min/max for student eye contact, energy."""
    summary = await generate_summary(sample_session.id, db_session)

    student = summary.student_metrics
    assert student["eye_contact"]["avg"] == pytest.approx(0.6)
    assert student["energy"]["avg"] == pytest.approx(0.5)


@pytest.mark.asyncio
async def test_generate_summary_talk_time_ratio(db_session, sample_session):
    """Summary includes talk time ratio from metrics."""
    summary = await generate_summary(sample_session.id, db_session)

    assert summary.talk_time_ratio["tutor_pct"] == pytest.approx(65.0)
    assert summary.talk_time_ratio["student_pct"] == pytest.approx(35.0)


@pytest.mark.asyncio
async def test_generate_summary_interruptions(db_session, sample_session):
    """Summary includes total interruption count from final snapshot."""
    summary = await generate_summary(sample_session.id, db_session)

    # Last snapshot has interruption_count = 9 // 5 = 1
    assert summary.total_interruptions == 1


@pytest.mark.asyncio
async def test_generate_summary_flagged_moments_include_nudges(db_session, sample_session):
    """Flagged moments include nudges delivered during the session."""
    summary = await generate_summary(sample_session.id, db_session)

    nudge_moments = [m for m in summary.flagged_moments if m["source"] == "nudge"]
    assert len(nudge_moments) == 1
    assert nudge_moments[0]["type"] == "tutor_dominant"
    assert nudge_moments[0]["timestamp_ms"] == 3000


@pytest.mark.asyncio
async def test_generate_summary_flagged_moments_include_drift(
    db_session, session_with_varied_metrics,
):
    """Flagged moments include attention drift events."""
    summary = await generate_summary(session_with_varied_metrics.id, db_session)

    drift_moments = [m for m in summary.flagged_moments if m["source"] == "drift"]
    assert len(drift_moments) >= 1


@pytest.mark.asyncio
async def test_generate_summary_min_max_varied_metrics(db_session, session_with_varied_metrics):
    """Min/max computed correctly from varied metric values."""
    summary = await generate_summary(session_with_varied_metrics.id, db_session)

    tutor = summary.tutor_metrics
    assert tutor["eye_contact"]["min"] == pytest.approx(0.3)
    assert tutor["eye_contact"]["max"] == pytest.approx(0.9)
    assert tutor["energy"]["min"] == pytest.approx(0.4)
    assert tutor["energy"]["max"] == pytest.approx(0.9)

    student = summary.student_metrics
    assert student["eye_contact"]["min"] == pytest.approx(0.2)
    assert student["eye_contact"]["max"] == pytest.approx(0.8)


@pytest.mark.asyncio
async def test_generate_summary_recommendations_2_to_4(db_session, sample_session):
    """Summary generates 2–4 recommendation strings."""
    summary = await generate_summary(sample_session.id, db_session)

    assert 2 <= len(summary.recommendations) <= 4
    for rec in summary.recommendations:
        assert isinstance(rec, str)
        assert len(rec) > 0


@pytest.mark.asyncio
async def test_generate_summary_engagement_score_range(db_session, sample_session):
    """Engagement score is between 0 and 100."""
    summary = await generate_summary(sample_session.id, db_session)

    assert 0.0 <= summary.overall_engagement_score <= 100.0


@pytest.mark.asyncio
async def test_generate_summary_persisted_to_db(db_session, sample_session):
    """Summary is persisted as a SessionSummary record."""
    await generate_summary(sample_session.id, db_session)

    result = await db_session.execute(
        select(SessionSummary).where(SessionSummary.session_id == sample_session.id)
    )
    stored = result.scalar_one_or_none()
    assert stored is not None
    assert stored.session_id == sample_session.id


@pytest.mark.asyncio
async def test_generate_summary_empty_session(db_session, empty_session):
    """Summary handles session with no snapshots gracefully."""
    summary = await generate_summary(empty_session.id, db_session)

    assert summary is not None
    assert summary.total_interruptions == 0
    assert summary.overall_engagement_score == 0.0
    assert summary.tutor_metrics == {}
    assert summary.student_metrics == {}


@pytest.mark.asyncio
async def test_generate_summary_interruption_attribution(db_session, session_with_varied_metrics):
    """Summary includes interruption attribution (tutor vs student counts)."""
    summary = await generate_summary(session_with_varied_metrics.id, db_session)

    assert "tutor_count" in summary.interruption_attribution
    assert "student_count" in summary.interruption_attribution


@pytest.mark.asyncio
async def test_compute_recommendations_tutor_dominant():
    """Recommendations flag tutor-dominant talk time."""
    recs = _compute_recommendations(
        tutor_metrics={"eye_contact": {"avg": 0.8}, "energy": {"avg": 0.7}},
        student_metrics={"eye_contact": {"avg": 0.7}, "energy": {"avg": 0.6}},
        talk_time_ratio={"tutor_pct": 85.0, "student_pct": 15.0},
        total_interruptions=0,
        drift_count=0,
    )
    assert any("talk" in r.lower() or "question" in r.lower() or "speak" in r.lower() for r in recs)


@pytest.mark.asyncio
async def test_compute_recommendations_low_eye_contact():
    """Recommendations flag low student eye contact."""
    recs = _compute_recommendations(
        tutor_metrics={"eye_contact": {"avg": 0.8}, "energy": {"avg": 0.7}},
        student_metrics={"eye_contact": {"avg": 0.25}, "energy": {"avg": 0.6}},
        talk_time_ratio={"tutor_pct": 50.0, "student_pct": 50.0},
        total_interruptions=0,
        drift_count=0,
    )
    assert any(
        "eye contact" in r.lower() or "engagement" in r.lower()
        or "attention" in r.lower() for r in recs
    )


@pytest.mark.asyncio
async def test_compute_recommendations_high_interruptions():
    """Recommendations flag high interruption count."""
    recs = _compute_recommendations(
        tutor_metrics={"eye_contact": {"avg": 0.8}, "energy": {"avg": 0.7}},
        student_metrics={"eye_contact": {"avg": 0.7}, "energy": {"avg": 0.6}},
        talk_time_ratio={"tutor_pct": 50.0, "student_pct": 50.0},
        total_interruptions=8,
        drift_count=0,
    )
    assert any("interrupt" in r.lower() for r in recs)
