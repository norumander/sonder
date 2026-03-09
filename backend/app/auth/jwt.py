"""JWT creation and validation."""

from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt

from app.config import settings


def create_access_token(tutor_id: str) -> str:
    """Create a JWT access token for a tutor."""
    return _create_token_with_expiry(tutor_id, hours=settings.jwt_expiration_hours)


def _create_token_with_expiry(tutor_id: str, hours: int) -> str:
    """Create a JWT with a specific expiry (used in testing for expired tokens)."""
    expire = datetime.now(UTC) + timedelta(hours=hours)
    payload = {"sub": tutor_id, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict | None:
    """Decode and validate a JWT. Returns payload dict or None if invalid/expired."""
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
