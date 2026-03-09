"""Auth API routes."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_tutor
from app.auth.google import verify_google_token
from app.auth.jwt import create_access_token
from app.database import get_db
from app.models.models import NudgeType, Tutor

router = APIRouter(tags=["auth"])

DEFAULT_PREFERENCES = {
    "enabled_nudges": [nt.value for nt in NudgeType],
    "nudge_thresholds": {
        "student_silent_minutes": 3,
        "eye_contact_low": 0.3,
        "eye_contact_duration_s": 30,
        "tutor_talk_pct": 0.8,
        "tutor_talk_duration_minutes": 5,
        "energy_drop_pct": 0.3,
        "interruption_count": 3,
        "interruption_window_minutes": 2,
    },
}


class GoogleAuthRequest(BaseModel):
    """Request body for Google OAuth login."""

    token: str


class TutorResponse(BaseModel):
    """Tutor profile in auth responses."""

    id: str
    name: str
    email: str

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    """Response from Google OAuth login."""

    access_token: str
    tutor: TutorResponse


@router.post("/auth/google", response_model=AuthResponse)
async def google_login(body: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate with Google OAuth. Creates tutor on first login."""
    user_info = verify_google_token(body.token)
    if user_info is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid Google token",
            headers={"code": "UNAUTHORIZED"},
        )

    # Check for existing tutor
    result = await db.execute(select(Tutor).where(Tutor.google_id == user_info["sub"]))
    tutor = result.scalar_one_or_none()

    if tutor is None:
        # First login — create tutor with default preferences
        tutor = Tutor(
            id=uuid.uuid4(),
            google_id=user_info["sub"],
            name=user_info["name"],
            email=user_info["email"],
            avatar_url=user_info.get("picture"),
            preferences=DEFAULT_PREFERENCES,
        )
        db.add(tutor)
        await db.commit()
        await db.refresh(tutor)

    access_token = create_access_token(tutor_id=str(tutor.id))
    return AuthResponse(
        access_token=access_token,
        tutor=TutorResponse(id=str(tutor.id), name=tutor.name, email=tutor.email),
    )


@router.get("/auth/me")
async def get_me(tutor: Tutor = Depends(get_current_tutor)):
    """Return the current tutor's profile."""
    return {
        "id": str(tutor.id),
        "name": tutor.name,
        "email": tutor.email,
        "avatar_url": tutor.avatar_url,
        "preferences": tutor.preferences,
    }
