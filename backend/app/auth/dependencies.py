"""Auth dependencies for FastAPI routes."""

import uuid

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import decode_access_token
from app.database import get_db
from app.models.models import Tutor

security = HTTPBearer(auto_error=False)


async def get_current_tutor(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Tutor:
    """FastAPI dependency that extracts and validates the JWT, returning the Tutor."""
    if credentials is None:
        raise HTTPException(
            status_code=401, detail="Authentication required", headers={"code": "UNAUTHORIZED"}
        )

    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=401, detail="Invalid or expired token", headers={"code": "UNAUTHORIZED"}
        )

    tutor_id_str = payload.get("sub")
    if tutor_id_str is None:
        raise HTTPException(
            status_code=401, detail="Invalid token payload", headers={"code": "UNAUTHORIZED"}
        )

    try:
        tutor_id = uuid.UUID(tutor_id_str)
    except ValueError:
        raise HTTPException(
            status_code=401, detail="Invalid tutor ID in token", headers={"code": "UNAUTHORIZED"}
        )

    result = await db.execute(select(Tutor).where(Tutor.id == tutor_id))
    tutor = result.scalar_one_or_none()
    if tutor is None:
        raise HTTPException(
            status_code=401, detail="Tutor not found", headers={"code": "UNAUTHORIZED"}
        )

    return tutor
