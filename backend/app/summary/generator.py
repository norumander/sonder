"""Post-session summary generation.

Computes aggregated metrics, flagged moments, recommendations, and
overall engagement score from MetricSnapshots and Nudges.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import MetricSnapshot, Nudge, NudgeType, SessionSummary

logger = logging.getLogger(__name__)


def _aggregate_metric(values: list[float | None]) -> dict[str, float]:
    """Compute avg/min/max for a list of numeric values, ignoring None."""
    filtered = [v for v in values if v is not None]
    if not filtered:
        return {"avg": 0.0, "min": 0.0, "max": 0.0}
    return {
        "avg": round(sum(filtered) / len(filtered), 4),
        "min": round(min(filtered), 4),
        "max": round(max(filtered), 4),
    }


def _compute_engagement_score(
    tutor_metrics: dict[str, Any],
    student_metrics: dict[str, Any],
    talk_time_ratio: dict[str, float],
    total_interruptions: int,
    drift_count: int,
) -> float:
    """Compute overall engagement score (0–100).

    Factors:
    - Eye contact (both participants averaged): 30%
    - Talk time balance (closer to 50/50 = better): 25%
    - Energy (both averaged): 25%
    - Low interruptions: 10%
    - Low drift: 10%
    """
    if not tutor_metrics and not student_metrics:
        return 0.0

    # Eye contact score (avg of both, scaled to 100)
    tutor_eye = tutor_metrics.get("eye_contact", {}).get("avg", 0.0)
    student_eye = student_metrics.get("eye_contact", {}).get("avg", 0.0)
    eye_score = ((tutor_eye + student_eye) / 2) * 100

    # Talk time balance (100 = perfectly balanced, 0 = one person talks 100%)
    tutor_pct = talk_time_ratio.get("tutor_pct", 50.0)
    balance = 100 - abs(tutor_pct - 50.0) * 2
    balance = max(0.0, balance)

    # Energy (avg of both, scaled to 100)
    tutor_energy = tutor_metrics.get("energy", {}).get("avg", 0.0)
    student_energy = student_metrics.get("energy", {}).get("avg", 0.0)
    energy_score = ((tutor_energy + student_energy) / 2) * 100

    # Interruption penalty (0 = perfect, drops with more interruptions)
    interruption_score = max(0.0, 100 - total_interruptions * 10)

    # Drift penalty (0 = perfect, drops with more drift events)
    drift_score = max(0.0, 100 - drift_count * 20)

    composite = (
        eye_score * 0.30
        + balance * 0.25
        + energy_score * 0.25
        + interruption_score * 0.10
        + drift_score * 0.10
    )
    return round(max(0.0, min(100.0, composite)), 1)


def _compute_recommendations(
    tutor_metrics: dict[str, Any],
    student_metrics: dict[str, Any],
    talk_time_ratio: dict[str, float],
    total_interruptions: int,
    drift_count: int,
) -> list[str]:
    """Generate 2–4 personalized recommendations based on weakest metrics.

    Args:
        tutor_metrics: Aggregated tutor metrics with avg/min/max.
        student_metrics: Aggregated student metrics with avg/min/max.
        talk_time_ratio: Dict with tutor_pct and student_pct.
        total_interruptions: Total interruption count.
        drift_count: Number of attention drift events.

    Returns:
        List of 2–4 recommendation strings.
    """
    recs: list[str] = []

    tutor_pct = talk_time_ratio.get("tutor_pct", 50.0)
    student_eye_avg = student_metrics.get("eye_contact", {}).get("avg", 1.0)
    tutor_eye_avg = tutor_metrics.get("eye_contact", {}).get("avg", 1.0)
    student_energy_avg = student_metrics.get("energy", {}).get("avg", 1.0)
    tutor_energy_avg = tutor_metrics.get("energy", {}).get("avg", 1.0)

    # Tutor dominant talk time
    if tutor_pct > 70:
        recs.append(
            "Try asking more open-ended questions to give the student more opportunities to speak."
        )

    # Student low eye contact
    if student_eye_avg < 0.4:
        recs.append(
            "Student eye contact was low. Consider using visual aids "
            "or direct engagement to hold attention."
        )

    # Tutor low eye contact
    if tutor_eye_avg < 0.4:
        recs.append(
            "Your eye contact was lower than usual. Try looking directly at the camera more often."
        )

    # High interruptions
    if total_interruptions > 5:
        recs.append(
            "There were frequent interruptions. Practice pausing "
            "after questions to allow full responses."
        )

    # Student low energy
    if student_energy_avg < 0.3:
        recs.append(
            "Student energy was low. Consider varying your teaching "
            "approach or taking a short break."
        )

    # Tutor low energy
    if tutor_energy_avg < 0.3:
        recs.append(
            "Your energy level was low. Varying vocal tone and facial "
            "expressions can help keep sessions engaging."
        )

    # Frequent drift
    if drift_count > 3:
        recs.append(
            "Attention drift was detected multiple times. Shorter, more "
            "interactive segments may help maintain focus."
        )

    # Ensure at least 2 recommendations
    if len(recs) < 2:
        defaults = [
            "Great session overall! Keep up the balanced conversation approach.",
            "Continue encouraging student participation for even better engagement.",
        ]
        for d in defaults:
            if len(recs) < 2:
                recs.append(d)

    # Cap at 4
    return recs[:4]


async def generate_summary(
    session_id: str | Any,
    db: AsyncSession,
) -> SessionSummary:
    """Generate and persist a post-session summary.

    Queries all MetricSnapshots and Nudges for the session, computes
    aggregated metrics, flagged moments, recommendations, and an
    overall engagement score.

    Args:
        session_id: UUID of the session.
        db: Async database session.

    Returns:
        The created SessionSummary record.
    """
    # Fetch all metric snapshots ordered by timestamp
    result = await db.execute(
        select(MetricSnapshot)
        .where(MetricSnapshot.session_id == session_id)
        .order_by(MetricSnapshot.timestamp_ms)
    )
    snapshots = result.scalars().all()

    # Fetch all nudges for the session
    nudge_result = await db.execute(
        select(Nudge)
        .where(Nudge.session_id == session_id)
        .order_by(Nudge.timestamp_ms)
    )
    nudges = nudge_result.scalars().all()

    if not snapshots:
        # No data — create empty summary
        summary = SessionSummary(
            id=uuid.uuid4(),
            session_id=session_id,
            tutor_metrics={},
            student_metrics={},
            talk_time_ratio={"tutor_pct": 0.0, "student_pct": 0.0},
            total_interruptions=0,
            interruption_attribution={"tutor_count": 0, "student_count": 0},
            flagged_moments=[],
            recommendations=[
                "Great session overall! Keep up the balanced conversation approach.",
                "Continue encouraging student participation for even better engagement.",
            ],
            overall_engagement_score=0.0,
        )
        db.add(summary)
        await db.commit()
        await db.refresh(summary)
        return summary

    # Extract metric values per participant
    tutor_eye_values = [s.metrics.get("tutor_eye_contact") for s in snapshots]
    student_eye_values = [s.metrics.get("student_eye_contact") for s in snapshots]
    tutor_energy_values = [s.metrics.get("tutor_energy") for s in snapshots]
    student_energy_values = [s.metrics.get("student_energy") for s in snapshots]

    tutor_metrics = {
        "eye_contact": _aggregate_metric(tutor_eye_values),
        "energy": _aggregate_metric(tutor_energy_values),
    }
    student_metrics = {
        "eye_contact": _aggregate_metric(student_eye_values),
        "energy": _aggregate_metric(student_energy_values),
    }

    # Talk time ratio from average across snapshots (filter None values)
    tutor_talk_values = [v for s in snapshots if (v := s.metrics.get("tutor_talk_pct")) is not None]
    student_talk_values = [v for s in snapshots if (v := s.metrics.get("student_talk_pct")) is not None]
    talk_time_ratio = {
        "tutor_pct": round(sum(tutor_talk_values) / len(tutor_talk_values), 1) if tutor_talk_values else 0.0,
        "student_pct": round(sum(student_talk_values) / len(student_talk_values), 1) if student_talk_values else 0.0,
    }

    # Total interruptions from the final snapshot (cumulative)
    last_snapshot = snapshots[-1]
    total_interruptions = last_snapshot.metrics.get("interruption_count", 0)

    # Interruption attribution — not stored per-snapshot, estimate from nudges
    tutor_int_count = 0
    for n in nudges:
        if n.nudge_type == NudgeType.INTERRUPTION_SPIKE:
            # Attribution not directly available; count as shared
            tutor_int_count += 1
    interruption_attribution = {
        "tutor_count": tutor_int_count,
        "student_count": max(0, total_interruptions - tutor_int_count),
    }

    # Flagged moments: nudges + drift events
    flagged_moments: list[dict[str, Any]] = []

    for n in nudges:
        flagged_moments.append({
            "source": "nudge",
            "type": n.nudge_type.value if hasattr(n.nudge_type, "value") else str(n.nudge_type),
            "message": n.message,
            "priority": n.priority.value if hasattr(n.priority, "value") else str(n.priority),
            "timestamp_ms": n.timestamp_ms,
        })

    # Drift events from snapshots (where drift transitions to True)
    prev_tutor_drift = False
    prev_student_drift = False
    drift_count = 0
    for s in snapshots:
        tutor_drift = s.metrics.get("tutor_attention_drift", False)
        student_drift = s.metrics.get("student_attention_drift", False)
        reason = s.metrics.get("drift_reason")

        if tutor_drift and not prev_tutor_drift:
            drift_count += 1
            flagged_moments.append({
                "source": "drift",
                "role": "tutor",
                "reason": reason or "attention_drift",
                "timestamp_ms": s.timestamp_ms,
            })
        if student_drift and not prev_student_drift:
            drift_count += 1
            flagged_moments.append({
                "source": "drift",
                "role": "student",
                "reason": reason or "attention_drift",
                "timestamp_ms": s.timestamp_ms,
            })
        prev_tutor_drift = tutor_drift
        prev_student_drift = student_drift

    # Sort flagged moments by timestamp
    flagged_moments.sort(key=lambda m: m.get("timestamp_ms", 0))

    # Recommendations
    recommendations = _compute_recommendations(
        tutor_metrics, student_metrics,
        talk_time_ratio, total_interruptions, drift_count,
    )

    # Engagement score
    engagement_score = _compute_engagement_score(
        tutor_metrics, student_metrics,
        talk_time_ratio, total_interruptions, drift_count,
    )

    # Persist
    summary = SessionSummary(
        id=uuid.uuid4(),
        session_id=session_id,
        tutor_metrics=tutor_metrics,
        student_metrics=student_metrics,
        talk_time_ratio=talk_time_ratio,
        total_interruptions=total_interruptions,
        interruption_attribution=interruption_attribution,
        flagged_moments=flagged_moments,
        recommendations=recommendations,
        overall_engagement_score=engagement_score,
    )
    db.add(summary)
    await db.commit()
    await db.refresh(summary)
    return summary
