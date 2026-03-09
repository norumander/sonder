"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings with environment variable loading."""

    # Database
    database_url: str = "postgresql+asyncpg://sonder:sonder@localhost:5432/sonder"

    # Auth
    google_client_id: str = ""
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24

    # Server
    cors_origins: list[str] = ["http://localhost:5173"]

    model_config = {"env_prefix": "SONDER_", "env_file": ".env"}


settings = Settings()
