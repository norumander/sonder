"""Tests for tutor preferences API — TDD Red phase for TASK-004."""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.auth.jwt import create_access_token
from app.auth.router import DEFAULT_PREFERENCES
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


@pytest.fixture
async def tutor_with_token(db_session):
    """Create a tutor with default preferences and return (tutor, token)."""
    tutor = Tutor(
        id=uuid.uuid4(),
        google_id="google-prefs-test",
        name="Prefs Tutor",
        email="prefs@example.com",
        preferences=DEFAULT_PREFERENCES,
    )
    db_session.add(tutor)
    await db_session.commit()
    token = create_access_token(tutor_id=str(tutor.id))
    return tutor, token


# --- GET /tutor/preferences ---


async def test_get_preferences_returns_defaults(client, tutor_with_token):
    """GET /tutor/preferences returns the tutor's current preferences."""
    tutor, token = tutor_with_token
    response = await client.get(
        "/tutor/preferences", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["enabled_nudges"] == DEFAULT_PREFERENCES["enabled_nudges"]
    assert data["nudge_thresholds"] == DEFAULT_PREFERENCES["nudge_thresholds"]


async def test_get_preferences_requires_auth(client):
    """GET /tutor/preferences without JWT returns 401."""
    response = await client.get("/tutor/preferences")
    assert response.status_code == 401


# --- PUT /tutor/preferences ---


async def test_put_preferences_updates_thresholds(client, db_session, tutor_with_token):
    """PUT /tutor/preferences updates nudge thresholds."""
    tutor, token = tutor_with_token
    updated = {
        "enabled_nudges": DEFAULT_PREFERENCES["enabled_nudges"],
        "nudge_thresholds": {
            **DEFAULT_PREFERENCES["nudge_thresholds"],
            "student_silent_minutes": 5,
            "eye_contact_low": 0.2,
        },
    }
    response = await client.put(
        "/tutor/preferences",
        json=updated,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["nudge_thresholds"]["student_silent_minutes"] == 5
    assert data["nudge_thresholds"]["eye_contact_low"] == 0.2


async def test_put_preferences_updates_enabled_nudges(client, tutor_with_token):
    """PUT /tutor/preferences can disable specific nudge types."""
    tutor, token = tutor_with_token
    updated = {
        "enabled_nudges": ["student_silent", "tutor_dominant"],
        "nudge_thresholds": DEFAULT_PREFERENCES["nudge_thresholds"],
    }
    response = await client.put(
        "/tutor/preferences",
        json=updated,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["enabled_nudges"] == ["student_silent", "tutor_dominant"]


async def test_put_preferences_persists_across_requests(client, tutor_with_token):
    """Preferences survive across separate GET requests (persisted to DB)."""
    tutor, token = tutor_with_token
    updated = {
        "enabled_nudges": ["student_silent"],
        "nudge_thresholds": {
            **DEFAULT_PREFERENCES["nudge_thresholds"],
            "student_silent_minutes": 10,
        },
    }
    await client.put(
        "/tutor/preferences",
        json=updated,
        headers={"Authorization": f"Bearer {token}"},
    )

    # Second GET should reflect the update
    response = await client.get(
        "/tutor/preferences", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["enabled_nudges"] == ["student_silent"]
    assert data["nudge_thresholds"]["student_silent_minutes"] == 10


async def test_put_preferences_requires_auth(client):
    """PUT /tutor/preferences without JWT returns 401."""
    response = await client.put("/tutor/preferences", json={})
    assert response.status_code == 401


async def test_put_preferences_rejects_invalid_nudge_type(client, tutor_with_token):
    """PUT /tutor/preferences rejects unknown nudge types in enabled_nudges."""
    tutor, token = tutor_with_token
    updated = {
        "enabled_nudges": ["student_silent", "not_a_real_nudge"],
        "nudge_thresholds": DEFAULT_PREFERENCES["nudge_thresholds"],
    }
    response = await client.put(
        "/tutor/preferences",
        json=updated,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 422


async def test_put_preferences_rejects_missing_fields(client, tutor_with_token):
    """PUT /tutor/preferences rejects body missing required fields."""
    tutor, token = tutor_with_token
    response = await client.put(
        "/tutor/preferences",
        json={"enabled_nudges": ["student_silent"]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 422
