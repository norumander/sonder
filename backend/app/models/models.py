"""SQLAlchemy 2.0 models for Sonder."""

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

# --- Enums ---


class SessionStatus(enum.StrEnum):
    """Session lifecycle status."""

    WAITING = "waiting"
    ACTIVE = "active"
    COMPLETED = "completed"


class SessionType(enum.StrEnum):
    """Whether the session is live or pre-recorded."""

    LIVE = "live"
    PRE_RECORDED = "pre_recorded"


class NudgeType(enum.StrEnum):
    """Types of coaching nudges."""

    STUDENT_SILENT = "student_silent"
    STUDENT_LOW_EYE_CONTACT = "student_low_eye_contact"
    TUTOR_DOMINANT = "tutor_dominant"
    STUDENT_ENERGY_DROP = "student_energy_drop"
    INTERRUPTION_SPIKE = "interruption_spike"
    TUTOR_LOW_EYE_CONTACT = "tutor_low_eye_contact"


class NudgePriority(enum.StrEnum):
    """Priority level for nudges."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


# --- Models ---


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Tutor(Base):
    """Tutor account linked to Google OAuth."""

    __tablename__ = "tutors"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    google_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String, nullable=True)
    preferences: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    sessions: Mapped[list["Session"]] = relationship(back_populates="tutor")


class Session(Base):
    """A tutoring session between one tutor and one student."""

    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tutor_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tutors.id"), nullable=False
    )
    join_code: Mapped[str] = mapped_column(String(6), unique=True, nullable=False, index=True)
    status: Mapped[SessionStatus] = mapped_column(
        Enum(SessionStatus, native_enum=False), nullable=False, default=SessionStatus.WAITING
    )
    session_type: Mapped[SessionType] = mapped_column(
        Enum(SessionType, native_enum=False), nullable=False, default=SessionType.LIVE
    )
    student_display_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    subject: Mapped[str | None] = mapped_column(String, nullable=True)
    session_type_label: Mapped[str | None] = mapped_column(String, nullable=True)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    join_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    tutor: Mapped["Tutor"] = relationship(back_populates="sessions")
    metric_snapshots: Mapped[list["MetricSnapshot"]] = relationship(back_populates="session")
    nudges: Mapped[list["Nudge"]] = relationship(back_populates="session")
    summary: Mapped["SessionSummary | None"] = relationship(back_populates="session", uselist=False)


class MetricSnapshot(Base):
    """Time-series metric snapshot captured during a session."""

    __tablename__ = "metric_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("sessions.id"), nullable=False
    )
    timestamp_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    metrics: Mapped[dict] = mapped_column(JSON, nullable=False)

    session: Mapped["Session"] = relationship(back_populates="metric_snapshots")

    __table_args__ = (
        Index("ix_metric_snapshots_session_ts", "session_id", "timestamp_ms"),
    )


class Nudge(Base):
    """A coaching nudge delivered during a session."""

    __tablename__ = "nudges"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("sessions.id"), nullable=False
    )
    timestamp_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    nudge_type: Mapped[NudgeType] = mapped_column(
        Enum(NudgeType, native_enum=False), nullable=False
    )
    message: Mapped[str] = mapped_column(String, nullable=False)
    priority: Mapped[NudgePriority] = mapped_column(
        Enum(NudgePriority, native_enum=False), nullable=False
    )
    trigger_metrics: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    session: Mapped["Session"] = relationship(back_populates="nudges")


class SessionSummary(Base):
    """Post-session summary with aggregated metrics and recommendations."""

    __tablename__ = "session_summaries"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("sessions.id"), unique=True, nullable=False
    )
    tutor_metrics: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    student_metrics: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    talk_time_ratio: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    total_interruptions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    interruption_attribution: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    flagged_moments: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    recommendations: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    overall_engagement_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    session: Mapped["Session"] = relationship(back_populates="summary")
