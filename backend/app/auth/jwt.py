"""JWT creation and validation."""

from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt

from app.config import settings


def create_access_token(tutor_id: str) -> str:
    """Create a JWT access token for a tutor."""
    return _create_token(sub=tutor_id, role="tutor", hours=settings.jwt_expiration_hours)


def create_student_token(session_id: str) -> str:
    """Create a JWT access token for a student scoped to a specific session."""
    return _create_token(sub=session_id, role="student", hours=settings.jwt_expiration_hours)


def _create_token(sub: str, role: str, hours: int) -> str:
    """Create a JWT with subject, role, and expiry."""
    expire = datetime.now(UTC) + timedelta(hours=hours)
    payload = {"sub": sub, "role": role, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _create_token_with_expiry(tutor_id: str, hours: int) -> str:
    """Create a tutor JWT with a specific expiry (used in testing for expired tokens)."""
    return _create_token(sub=tutor_id, role="tutor", hours=hours)


def decode_access_token(token: str) -> dict | None:
    """Decode and validate a JWT. Returns payload dict or None if invalid/expired."""
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
