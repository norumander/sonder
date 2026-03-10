"""Cross-session trend analysis API."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.auth.dependencies import get_current_tutor
from app.database import get_db
from app.models.models import Session, SessionSummary, Tutor

router = APIRouter(tags=["trends"])

MAX_TREND_SESSIONS = 10


@router.get("/tutor/trends")
async def get_trends(
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Return per-session metric averages for the tutor's last 10 sessions with summaries.

    Sessions are ordered by start_time ascending (oldest first) for chart rendering.
    Only sessions that have a generated SessionSummary are included.
    """
    result = await db.execute(
        select(Session)
        .join(SessionSummary, Session.id == SessionSummary.session_id)
        .options(joinedload(Session.summary))
        .where(Session.tutor_id == tutor.id)
        .order_by(Session.start_time.desc())
        .limit(MAX_TREND_SESSIONS)
    )
    sessions = result.unique().scalars().all()

    # Reverse to ascending order for chart x-axis
    sessions = list(reversed(sessions))

    data_points = []
    for s in sessions:
        summary = s.summary
        tutor_metrics = summary.tutor_metrics or {}
        student_metrics = summary.student_metrics or {}
        talk_ratio = summary.talk_time_ratio or {}

        data_points.append({
            "session_id": str(s.id),
            "start_time": s.start_time.isoformat() if s.start_time else None,
            "end_time": s.end_time.isoformat() if s.end_time else None,
            "tutor_eye_contact": tutor_metrics.get("eye_contact", {}).get("avg"),
            "student_eye_contact": student_metrics.get("eye_contact", {}).get("avg"),
            "tutor_energy": tutor_metrics.get("energy", {}).get("avg"),
            "student_energy": student_metrics.get("energy", {}).get("avg"),
            "tutor_talk_pct": talk_ratio.get("tutor_pct"),
            "student_talk_pct": talk_ratio.get("student_pct"),
            "total_interruptions": summary.total_interruptions,
            "engagement_score": summary.overall_engagement_score,
        })

    return {"sessions": data_points}
