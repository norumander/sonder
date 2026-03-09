"""Tutor preferences API routes."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_tutor
from app.database import get_db
from app.models.models import NudgeType, Tutor

router = APIRouter(tags=["preferences"])

VALID_NUDGE_TYPES = {nt.value for nt in NudgeType}


class NudgeThresholds(BaseModel):
    """Configurable nudge trigger thresholds."""

    student_silent_minutes: float
    eye_contact_low: float
    eye_contact_duration_s: float
    tutor_talk_pct: float
    tutor_talk_duration_minutes: float
    energy_drop_pct: float
    interruption_count: int
    interruption_window_minutes: float


class PreferencesBody(BaseModel):
    """Request/response body for tutor preferences."""

    enabled_nudges: list[str]
    nudge_thresholds: NudgeThresholds

    @field_validator("enabled_nudges")
    @classmethod
    def validate_nudge_types(cls, v: list[str]) -> list[str]:
        """Ensure all enabled nudge types are valid."""
        invalid = [n for n in v if n not in VALID_NUDGE_TYPES]
        if invalid:
            raise ValueError(f"Invalid nudge type(s): {', '.join(invalid)}")
        return v


@router.get("/tutor/preferences", response_model=PreferencesBody)
async def get_preferences(tutor: Tutor = Depends(get_current_tutor)):
    """Return the current tutor's nudge preferences."""
    return tutor.preferences


@router.put("/tutor/preferences", response_model=PreferencesBody)
async def put_preferences(
    body: PreferencesBody,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Update the tutor's nudge preferences."""
    tutor.preferences = body.model_dump()
    await db.commit()
    await db.refresh(tutor)
    return tutor.preferences
