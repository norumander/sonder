"""Tests for auth module — TDD Red phase for TASK-002."""

import uuid
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.auth.jwt import create_access_token, decode_access_token
from app.models.base import Base
from app.models.models import Tutor


@pytest.fixture
async def db_session():
    """Create an in-memory SQLite async session for testing."""
    engine = create_async_engine("sqlite+aiosqlite://", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


# --- JWT Tests ---


def test_create_access_token_returns_string():
    """create_access_token returns a non-empty JWT string."""
    token = create_access_token(tutor_id=str(uuid.uuid4()))
    assert isinstance(token, str)
    assert len(token) > 0


def test_decode_access_token_roundtrip():
    """Token created by create_access_token can be decoded to get the tutor_id."""
    tutor_id = str(uuid.uuid4())
    token = create_access_token(tutor_id=tutor_id)
    payload = decode_access_token(token)
    assert payload["sub"] == tutor_id


def test_decode_access_token_invalid_returns_none():
    """Invalid token returns None."""
    result = decode_access_token("invalid.token.here")
    assert result is None


def test_decode_access_token_expired_returns_none():
    """Expired token returns None."""
    from app.auth.jwt import _create_token_with_expiry

    tutor_id = str(uuid.uuid4())
    token = _create_token_with_expiry(tutor_id, hours=-1)
    result = decode_access_token(token)
    assert result is None


# --- Auth Endpoint Tests ---


@pytest.fixture
async def test_app(db_session):
    """Create a FastAPI test app with the DB session override."""
    from app.database import get_db
    from app.main import app

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    yield app
    app.dependency_overrides.clear()


@pytest.fixture
async def client(test_app):
    """Async HTTP test client."""
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


MOCK_GOOGLE_USER = {
    "sub": "google-user-123",
    "name": "Test Tutor",
    "email": "tutor@example.com",
    "picture": "https://example.com/avatar.png",
}


async def test_auth_google_creates_tutor_on_first_login(client, db_session):
    """POST /auth/google with valid token creates a Tutor and returns JWT."""
    with patch("app.auth.router.verify_google_token", return_value=MOCK_GOOGLE_USER):
        response = await client.post("/auth/google", json={"token": "valid-google-token"})

    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["tutor"]["name"] == "Test Tutor"
    assert data["tutor"]["email"] == "tutor@example.com"

    # Verify Tutor was created in DB
    result = await db_session.execute(
        select(Tutor).where(Tutor.google_id == "google-user-123")
    )
    tutor = result.scalar_one()
    assert tutor.name == "Test Tutor"


async def test_auth_google_returns_existing_tutor_on_subsequent_login(client, db_session):
    """POST /auth/google for existing tutor returns same tutor record."""
    # Create tutor first
    tutor = Tutor(
        id=uuid.uuid4(),
        google_id="google-user-123",
        name="Existing Tutor",
        email="tutor@example.com",
    )
    db_session.add(tutor)
    await db_session.commit()

    with patch("app.auth.router.verify_google_token", return_value=MOCK_GOOGLE_USER):
        response = await client.post("/auth/google", json={"token": "valid-google-token"})

    assert response.status_code == 200
    data = response.json()
    assert data["tutor"]["id"] == str(tutor.id)


async def test_auth_google_invalid_token_returns_401(client):
    """POST /auth/google with invalid token returns 401."""
    with patch("app.auth.router.verify_google_token", return_value=None):
        response = await client.post("/auth/google", json={"token": "bad-token"})

    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"


async def test_auth_me_with_valid_jwt(client, db_session):
    """GET /auth/me with valid JWT returns tutor profile."""
    tutor = Tutor(
        id=uuid.uuid4(),
        google_id="google-me-test",
        name="Me Tutor",
        email="me@example.com",
    )
    db_session.add(tutor)
    await db_session.commit()

    token = create_access_token(tutor_id=str(tutor.id))
    response = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Me Tutor"
    assert data["email"] == "me@example.com"


async def test_auth_me_without_jwt_returns_401(client):
    """GET /auth/me without JWT returns 401."""
    response = await client.get("/auth/me")
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"


async def test_auth_me_with_invalid_jwt_returns_401(client):
    """GET /auth/me with invalid JWT returns 401."""
    response = await client.get("/auth/me", headers={"Authorization": "Bearer bad-token"})
    assert response.status_code == 401


async def test_tutor_created_with_default_preferences(client, db_session):
    """First login creates tutor with default nudge preferences."""
    with patch("app.auth.router.verify_google_token", return_value=MOCK_GOOGLE_USER):
        response = await client.post("/auth/google", json={"token": "valid-google-token"})

    assert response.status_code == 200
    result = await db_session.execute(
        select(Tutor).where(Tutor.google_id == "google-user-123")
    )
    tutor = result.scalar_one()
    prefs = tutor.preferences
    assert "enabled_nudges" in prefs
    assert "nudge_thresholds" in prefs
    assert len(prefs["enabled_nudges"]) == 6  # All 6 nudge types enabled
