"""Tests for session CRUD API — TDD Red phase for TASK-003."""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.auth.jwt import create_access_token
from app.models.base import Base
from app.models.models import Tutor


@pytest.fixture
async def db_session():
    """In-memory SQLite async session."""
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
async def tutor(db_session):
    """Create a test tutor."""
    t = Tutor(
        id=uuid.uuid4(),
        google_id="g-sess-test",
        name="Session Tutor",
        email="tutor@test.com",
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest.fixture
async def tutor_token(tutor):
    """JWT for the test tutor."""
    return create_access_token(tutor_id=str(tutor.id))


@pytest.fixture
async def test_app(db_session):
    """FastAPI app with DB override."""
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


# --- Create Session ---


async def test_create_session_returns_join_code(client, tutor_token):
    """POST /sessions creates session with status 'waiting' and 6-char join code."""
    response = await client.post(
        "/sessions",
        json={"subject": "Math"},
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "session_id" in data
    assert len(data["join_code"]) == 6
    assert data["join_code"].isalnum()
    assert "join_url" in data
    assert data["join_code"] in data["join_url"]


async def test_create_session_requires_auth(client):
    """POST /sessions without auth returns 401."""
    response = await client.post("/sessions", json={})
    assert response.status_code == 401


# --- Get Session ---


async def test_get_session_by_id(client, tutor_token):
    """GET /sessions/{id} returns session details."""
    # Create a session first
    create_resp = await client.post(
        "/sessions",
        json={"subject": "Physics"},
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    session_id = create_resp.json()["session_id"]

    response = await client.get(
        f"/sessions/{session_id}",
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == session_id
    assert data["subject"] == "Physics"
    assert data["status"] == "waiting"


# --- List Sessions ---


async def test_list_sessions_paginated(client, tutor_token):
    """GET /sessions returns paginated list, most recent first."""
    # Create 3 sessions
    for subj in ["Math", "Science", "History"]:
        await client.post(
            "/sessions",
            json={"subject": subj},
            headers={"Authorization": f"Bearer {tutor_token}"},
        )

    response = await client.get(
        "/sessions?limit=2&offset=0",
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["sessions"]) == 2
    assert data["total"] == 3


# --- Join Session ---


async def test_join_session_with_valid_code(client, tutor_token):
    """POST /sessions/join with valid code returns session_id and participant_token."""
    create_resp = await client.post(
        "/sessions",
        json={},
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    join_code = create_resp.json()["join_code"]

    response = await client.post(
        "/sessions/join",
        json={"join_code": join_code, "display_name": "Student Alice"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "session_id" in data
    assert "participant_token" in data


async def test_join_session_invalid_code_returns_404(client):
    """POST /sessions/join with invalid code returns 404."""
    response = await client.post(
        "/sessions/join",
        json={"join_code": "XXXXXX", "display_name": "Student"},
    )
    assert response.status_code == 404


async def test_join_session_already_joined_returns_409(client, tutor_token):
    """POST /sessions/join for session with existing student returns 409."""
    create_resp = await client.post(
        "/sessions",
        json={},
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    join_code = create_resp.json()["join_code"]

    # First join
    await client.post(
        "/sessions/join",
        json={"join_code": join_code, "display_name": "Student 1"},
    )
    # Second join — should fail
    response = await client.post(
        "/sessions/join",
        json={"join_code": join_code, "display_name": "Student 2"},
    )
    assert response.status_code == 409


async def test_join_session_completed_returns_410(client, tutor_token):
    """POST /sessions/join for completed session returns 410."""
    create_resp = await client.post(
        "/sessions",
        json={},
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    session_id = create_resp.json()["session_id"]
    join_code = create_resp.json()["join_code"]

    # End the session
    await client.patch(
        f"/sessions/{session_id}/end",
        headers={"Authorization": f"Bearer {tutor_token}"},
    )

    response = await client.post(
        "/sessions/join",
        json={"join_code": join_code, "display_name": "Late Student"},
    )
    assert response.status_code == 410


async def test_join_session_strips_html_from_display_name(client, tutor_token):
    """Display name should have HTML/script tags stripped."""
    create_resp = await client.post(
        "/sessions",
        json={},
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    join_code = create_resp.json()["join_code"]

    response = await client.post(
        "/sessions/join",
        json={"join_code": join_code, "display_name": "<script>alert('xss')</script>Alice"},
    )
    assert response.status_code == 200
    # Get session to verify sanitized name
    session_id = response.json()["session_id"]
    session_resp = await client.get(
        f"/sessions/{session_id}",
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    name = session_resp.json()["student_display_name"]
    assert "<script>" not in name
    assert "Alice" in name


async def test_join_session_validates_display_name_length(client, tutor_token):
    """Display name must be 1-50 characters."""
    create_resp = await client.post(
        "/sessions",
        json={},
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    join_code = create_resp.json()["join_code"]

    # Empty name
    response = await client.post(
        "/sessions/join",
        json={"join_code": join_code, "display_name": ""},
    )
    assert response.status_code == 422

    # Too long name
    response = await client.post(
        "/sessions/join",
        json={"join_code": join_code, "display_name": "A" * 51},
    )
    assert response.status_code == 422


# --- End Session ---


async def test_end_session_sets_completed(client, tutor_token):
    """PATCH /sessions/{id}/end sets status completed and end_time."""
    create_resp = await client.post(
        "/sessions",
        json={},
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    session_id = create_resp.json()["session_id"]

    response = await client.patch(
        f"/sessions/{session_id}/end",
        headers={"Authorization": f"Bearer {tutor_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["session_id"] == session_id
    assert data["end_time"] is not None
