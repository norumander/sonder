"""Application configuration loaded from environment variables."""

import logging

from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)

_DEFAULT_JWT_SECRET = "dev-secret-change-in-production"


class Settings(BaseSettings):
    """Application settings with environment variable loading."""

    # Database
    database_url: str = "postgresql+asyncpg://sonder:sonder@localhost:5433/sonder"

    # Auth
    google_client_id: str = ""
    jwt_secret: str = _DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24

    # Server
    cors_origins: list[str] = ["http://localhost:5173"]

    model_config = {"env_prefix": "SONDER_", "env_file": ".env"}


settings = Settings()

if settings.jwt_secret == _DEFAULT_JWT_SECRET:
    logger.warning(
        "SONDER_JWT_SECRET is using the default value. "
        "Set a secure random secret via environment variable."
    )
if not settings.google_client_id:
    logger.warning(
        "SONDER_GOOGLE_CLIENT_ID is not set. Google OAuth will not work."
    )
