"""Tests for Pydantic validation ranges on nudge preference thresholds — Chunk 1 remediation."""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.auth.jwt import create_access_token
from app.auth.router import DEFAULT_PREFERENCES
from app.models.base import Base
from app.models.models import Tutor
from app.preferences.router import NudgeThresholds


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


@pytest.fixture
async def tutor_with_token(db_session):
    """Create a tutor with default preferences and return (tutor, token)."""
    tutor = Tutor(
        id=uuid.uuid4(),
        google_id="google-validation-test",
        name="Validation Tutor",
        email="validation@example.com",
        preferences=DEFAULT_PREFERENCES,
    )
    db_session.add(tutor)
    await db_session.commit()
    token = create_access_token(tutor_id=str(tutor.id))
    return tutor, token


class TestNudgeThresholdsModel:
    """Unit tests for NudgeThresholds Pydantic model validation ranges."""

    def test_valid_thresholds_accepted(self):
        """Valid thresholds within range are accepted."""
        t = NudgeThresholds(**DEFAULT_PREFERENCES["nudge_thresholds"])
        assert t.student_silent_minutes == 3

    def test_eye_contact_low_below_zero_rejected(self):
        """eye_contact_low below 0 is rejected."""
        with pytest.raises(Exception):
            NudgeThresholds(
                **{**DEFAULT_PREFERENCES["nudge_thresholds"], "eye_contact_low": -0.1}
            )

    def test_eye_contact_low_above_one_rejected(self):
        """eye_contact_low above 1 is rejected."""
        with pytest.raises(Exception):
            NudgeThresholds(
                **{**DEFAULT_PREFERENCES["nudge_thresholds"], "eye_contact_low": 1.5}
            )

    def test_tutor_talk_pct_zero_rejected(self):
        """tutor_talk_pct of 0 is rejected (must be >0)."""
        with pytest.raises(Exception):
            NudgeThresholds(
                **{**DEFAULT_PREFERENCES["nudge_thresholds"], "tutor_talk_pct": 0}
            )

    def test_tutor_talk_pct_above_one_rejected(self):
        """tutor_talk_pct above 1.0 is rejected."""
        with pytest.raises(Exception):
            NudgeThresholds(
                **{**DEFAULT_PREFERENCES["nudge_thresholds"], "tutor_talk_pct": 1.5}
            )

    def test_energy_drop_pct_zero_rejected(self):
        """energy_drop_pct of 0 is rejected (must be >0)."""
        with pytest.raises(Exception):
            NudgeThresholds(
                **{**DEFAULT_PREFERENCES["nudge_thresholds"], "energy_drop_pct": 0}
            )

    def test_student_silent_minutes_zero_rejected(self):
        """student_silent_minutes of 0 is rejected (must be >0)."""
        with pytest.raises(Exception):
            NudgeThresholds(
                **{**DEFAULT_PREFERENCES["nudge_thresholds"], "student_silent_minutes": 0}
            )

    def test_interruption_count_zero_rejected(self):
        """interruption_count of 0 is rejected (must be >=1)."""
        with pytest.raises(Exception):
            NudgeThresholds(
                **{**DEFAULT_PREFERENCES["nudge_thresholds"], "interruption_count": 0}
            )

    def test_interruption_count_too_high_rejected(self):
        """interruption_count above 100 is rejected."""
        with pytest.raises(Exception):
            NudgeThresholds(
                **{**DEFAULT_PREFERENCES["nudge_thresholds"], "interruption_count": 101}
            )


class TestPreferenceValidationAPI:
    """Integration tests: PUT /tutor/preferences rejects invalid threshold ranges."""

    @pytest.fixture
    def _valid_body(self):
        """Valid preferences body for comparison."""
        return {
            "enabled_nudges": DEFAULT_PREFERENCES["enabled_nudges"],
            "nudge_thresholds": DEFAULT_PREFERENCES["nudge_thresholds"],
        }

    async def test_put_rejects_negative_eye_contact(self, client, tutor_with_token, _valid_body):
        """PUT /tutor/preferences rejects eye_contact_low < 0."""
        _, token = tutor_with_token
        body = {
            **_valid_body,
            "nudge_thresholds": {**_valid_body["nudge_thresholds"], "eye_contact_low": -0.5},
        }
        response = await client.put(
            "/tutor/preferences", json=body, headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 422

    async def test_put_rejects_energy_drop_above_one(self, client, tutor_with_token, _valid_body):
        """PUT /tutor/preferences rejects energy_drop_pct > 1."""
        _, token = tutor_with_token
        body = {
            **_valid_body,
            "nudge_thresholds": {**_valid_body["nudge_thresholds"], "energy_drop_pct": 1.5},
        }
        response = await client.put(
            "/tutor/preferences", json=body, headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 422

    async def test_put_accepts_valid_edge_values(self, client, tutor_with_token, _valid_body):
        """PUT /tutor/preferences accepts valid boundary values."""
        _, token = tutor_with_token
        body = {
            **_valid_body,
            "nudge_thresholds": {
                **_valid_body["nudge_thresholds"],
                "eye_contact_low": 0.0,  # ge=0
                "tutor_talk_pct": 1.0,   # le=1
                "interruption_count": 1,  # ge=1
            },
        }
        response = await client.put(
            "/tutor/preferences", json=body, headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
