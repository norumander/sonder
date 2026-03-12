"""Application configuration loaded from environment variables."""

import logging
import sys

from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    """Application settings with environment variable loading."""

    # Environment
    environment: str = "development"

    # Database
    database_url: str = "postgresql+asyncpg://sonder:sonder@localhost:5433/sonder"

    # Auth
    google_client_id: str = ""
    jwt_secret: str  # Required — must be set via SONDER_JWT_SECRET env var
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24

    # Server
    cors_origins: list[str] = ["http://localhost:5173"]

    model_config = {"env_prefix": "SONDER_", "env_file": ".env", "extra": "ignore"}


settings = Settings()

_is_production = settings.environment.lower() == "production"

if not settings.google_client_id:
    if _is_production:
        logger.critical(
            "SONDER_GOOGLE_CLIENT_ID is not set in production. "
            "Google OAuth will not work."
        )
        sys.exit(1)
    else:
        logger.warning(
            "SONDER_GOOGLE_CLIENT_ID is not set. Google OAuth will not work."
        )
