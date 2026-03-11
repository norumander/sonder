"""Session CRUD API routes."""

import secrets
import string
import uuid
from datetime import UTC, datetime

import bleach
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_tutor
from app.auth.jwt import create_student_token
from app.database import get_db
from app.models.models import MetricSnapshot, Nudge, Session, SessionStatus, SessionSummary, Tutor
from app.summary.generator import generate_summary

router = APIRouter(tags=["sessions"])


MAX_JOIN_CODE_RETRIES = 5


def _generate_join_code() -> str:
    """Generate a 6-character alphanumeric join code."""
    chars = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(chars) for _ in range(6))


# --- Request/Response Models ---


class CreateSessionRequest(BaseModel):
    """Request body for creating a session."""

    subject: str | None = None
    session_type_label: str | None = None


class CreateSessionResponse(BaseModel):
    """Response from creating a session."""

    session_id: str
    join_code: str
    join_url: str
    start_time: str


class JoinSessionRequest(BaseModel):
    """Request body for joining a session."""

    join_code: str
    display_name: str

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, v: str) -> str:
        """Validate display name: 1-50 chars, strip HTML."""
        v = bleach.clean(v, tags=[], strip=True).strip()
        if len(v) < 1 or len(v) > 50:
            raise ValueError("Display name must be 1-50 characters")
        return v


class JoinSessionResponse(BaseModel):
    """Response from joining a session."""

    session_id: str
    participant_token: str


class EndSessionResponse(BaseModel):
    """Response from ending a session."""

    session_id: str
    end_time: str


class SessionListResponse(BaseModel):
    """Paginated session list response."""

    sessions: list[dict]
    total: int


# --- Endpoints ---


@router.post("/sessions", response_model=CreateSessionResponse)
async def create_session(
    body: CreateSessionRequest,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Create a new tutoring session."""
    from sqlalchemy.exc import IntegrityError

    now = datetime.now(UTC)

    for attempt in range(MAX_JOIN_CODE_RETRIES):
        join_code = _generate_join_code()
        session = Session(
            id=uuid.uuid4(),
            tutor_id=tutor.id,
            join_code=join_code,
            status=SessionStatus.WAITING,
            subject=body.subject,
            session_type_label=body.session_type_label,
            start_time=now,
        )
        db.add(session)
        try:
            await db.commit()
            await db.refresh(session)
            return CreateSessionResponse(
                session_id=str(session.id),
                join_code=session.join_code,
                join_url=f"/join/{session.join_code}",
                start_time=now.isoformat(),
            )
        except IntegrityError:
            await db.rollback()
            if attempt == MAX_JOIN_CODE_RETRIES - 1:
                raise HTTPException(
                    status_code=500,
                    detail="Failed to generate unique join code. Please try again.",
                )


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Get session details. Tutor must own the session."""
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.execute(
        select(Session).where(Session.id == sid, Session.tutor_id == tutor.id)
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "id": str(session.id),
        "tutor_id": str(session.tutor_id),
        "join_code": session.join_code,
        "status": session.status.value,
        "session_type": session.session_type.value,
        "student_display_name": session.student_display_name,
        "subject": session.subject,
        "session_type_label": session.session_type_label,
        "start_time": session.start_time.isoformat() if session.start_time else None,
        "join_time": session.join_time.isoformat() if session.join_time else None,
        "end_time": session.end_time.isoformat() if session.end_time else None,
    }


@router.get("/sessions", response_model=SessionListResponse)
async def list_sessions(
    limit: int = 20,
    offset: int = 0,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """List tutor's sessions, most recent first."""
    limit = min(limit, 100)
    # Get total count
    count_result = await db.execute(
        select(func.count()).select_from(Session).where(Session.tutor_id == tutor.id)
    )
    total = count_result.scalar()

    # Get paginated results
    result = await db.execute(
        select(Session)
        .where(Session.tutor_id == tutor.id)
        .order_by(Session.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    sessions = result.scalars().all()

    return SessionListResponse(
        sessions=[
            {
                "id": str(s.id),
                "join_code": s.join_code,
                "status": s.status.value,
                "subject": s.subject,
                "student_display_name": s.student_display_name,
                "start_time": s.start_time.isoformat() if s.start_time else None,
                "end_time": s.end_time.isoformat() if s.end_time else None,
            }
            for s in sessions
        ],
        total=total,
    )


@router.post("/sessions/join", response_model=JoinSessionResponse)
async def join_session(body: JoinSessionRequest, db: AsyncSession = Depends(get_db)):
    """Student joins a session with a code and display name. No auth required."""
    result = await db.execute(
        select(Session).where(Session.join_code == body.join_code.upper())
    )
    session = result.scalar_one_or_none()

    if session is None:
        raise HTTPException(
            status_code=404,
            detail="Session not found",
            headers={"code": "NOT_FOUND"},
        )

    if session.status == SessionStatus.COMPLETED:
        raise HTTPException(
            status_code=410,
            detail="Session has ended",
            headers={"code": "GONE"},
        )

    if session.student_display_name is not None:
        raise HTTPException(
            status_code=409,
            detail="Session already has a student",
            headers={"code": "CONFLICT"},
        )

    # Update session with student info
    session.student_display_name = body.display_name
    session.status = SessionStatus.ACTIVE
    session.join_time = datetime.now(UTC)
    await db.commit()

    # Create a participant token (JWT with role=student, scoped to this session)
    participant_token = create_student_token(session_id=str(session.id))

    return JoinSessionResponse(
        session_id=str(session.id),
        participant_token=participant_token,
    )


@router.patch("/sessions/{session_id}/end", response_model=EndSessionResponse)
async def end_session(
    session_id: str,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """End a session. Sets status to completed and records end_time."""
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.execute(
        select(Session).where(Session.id == sid, Session.tutor_id == tutor.id)
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    # Idempotent: if already completed, return the existing end_time
    if session.status == SessionStatus.COMPLETED:
        end_time = session.end_time or datetime.now(UTC)
        return EndSessionResponse(
            session_id=str(session.id),
            end_time=end_time.isoformat(),
        )

    now = datetime.now(UTC)
    session.status = SessionStatus.COMPLETED
    session.end_time = now
    await db.commit()

    return EndSessionResponse(
        session_id=str(session.id),
        end_time=now.isoformat(),
    )


@router.get("/sessions/{session_id}/summary")
async def get_session_summary(
    session_id: str,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Get or generate the post-session summary. Tutor must own the session."""
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Session not found")

    # Verify ownership
    result = await db.execute(
        select(Session).where(Session.id == sid, Session.tutor_id == tutor.id)
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    # Check for existing summary
    summary_result = await db.execute(
        select(SessionSummary).where(SessionSummary.session_id == sid)
    )
    summary = summary_result.scalar_one_or_none()

    # Generate if not exists
    if summary is None:
        summary = await generate_summary(sid, db)

    return {
        "tutor_metrics": summary.tutor_metrics,
        "student_metrics": summary.student_metrics,
        "talk_time_ratio": summary.talk_time_ratio,
        "total_interruptions": summary.total_interruptions,
        "interruption_attribution": summary.interruption_attribution,
        "flagged_moments": summary.flagged_moments,
        "recommendations": summary.recommendations,
        "overall_engagement_score": summary.overall_engagement_score,
    }


@router.get("/sessions/{session_id}/snapshots")
async def get_session_snapshots(
    session_id: str,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Get metric snapshots for a session, ordered by timestamp. Tutor must own the session."""
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.execute(
        select(Session).where(Session.id == sid, Session.tutor_id == tutor.id)
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    snap_result = await db.execute(
        select(MetricSnapshot)
        .where(MetricSnapshot.session_id == sid)
        .order_by(MetricSnapshot.timestamp_ms.asc())
    )
    snapshots = snap_result.scalars().all()

    # Convert absolute epoch timestamps to session-relative
    start_epoch_ms = int(session.start_time.timestamp() * 1000)

    return {
        "snapshots": [
            {
                "timestamp_ms": max(0, s.timestamp_ms - start_epoch_ms),
                "metrics": s.metrics,
            }
            for s in snapshots
        ],
    }


@router.get("/sessions/{session_id}/nudges")
async def get_session_nudges(
    session_id: str,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Get nudges delivered during a session, ordered by timestamp. Tutor must own the session."""
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.execute(
        select(Session).where(Session.id == sid, Session.tutor_id == tutor.id)
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    nudge_result = await db.execute(
        select(Nudge)
        .where(Nudge.session_id == sid)
        .order_by(Nudge.timestamp_ms.asc())
    )
    nudges = nudge_result.scalars().all()

    # Convert absolute epoch timestamps to session-relative
    start_epoch_ms = int(session.start_time.timestamp() * 1000)

    return {
        "nudges": [
            {
                "timestamp_ms": max(0, n.timestamp_ms - start_epoch_ms),
                "nudge_type": n.nudge_type.value,
                "message": n.message,
                "priority": n.priority.value,
            }
            for n in nudges
        ],
    }
