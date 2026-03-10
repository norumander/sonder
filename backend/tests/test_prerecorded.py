"""Tests for pre-recorded video processing pipeline."""

from __future__ import annotations

import struct
import uuid
from dataclasses import dataclass
from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.auth.jwt import create_access_token
from app.models.base import Base
from app.models.models import Tutor
from app.prerecorded.face_analyzer import (
    FaceMetrics,
    compute_eye_contact,
    compute_facial_energy,
)

# --- Helpers ---


@dataclass
class MockLandmark:
    """Simulates a MediaPipe normalized landmark."""

    x: float
    y: float
    z: float = 0.0


def _make_landmarks(count: int = 478) -> list[MockLandmark]:
    """Create a list of neutral-position landmarks."""
    return [MockLandmark(x=0.5, y=0.5) for _ in range(count)]


def _set_eye_landmarks(
    landmarks: list[MockLandmark],
    iris_offset_x: float = 0.0,
    iris_offset_y: float = 0.0,
) -> list[MockLandmark]:
    """Set eye boundary and iris landmarks for testing eye contact.

    iris_offset_x=0 means centered (looking at camera).
    iris_offset_x=1.0 means iris at boundary (looking away).
    """
    # Left eye boundary (indices: outer=33, inner=133, top=159, bottom=145)
    landmarks[33] = MockLandmark(x=0.3, y=0.5)  # outer
    landmarks[133] = MockLandmark(x=0.5, y=0.5)  # inner
    landmarks[159] = MockLandmark(x=0.4, y=0.4)  # top
    landmarks[145] = MockLandmark(x=0.4, y=0.6)  # bottom

    # Left eye center = (0.4, 0.5), half_width = 0.1, half_height = 0.1
    left_iris_x = 0.4 + iris_offset_x * 0.1
    left_iris_y = 0.5 + iris_offset_y * 0.1
    landmarks[468] = MockLandmark(x=left_iris_x, y=left_iris_y)

    # Right eye boundary (indices: inner=362, outer=263, top=386, bottom=374)
    landmarks[362] = MockLandmark(x=0.5, y=0.5)  # inner
    landmarks[263] = MockLandmark(x=0.7, y=0.5)  # outer
    landmarks[386] = MockLandmark(x=0.6, y=0.4)  # top
    landmarks[374] = MockLandmark(x=0.6, y=0.6)  # bottom

    # Right eye center = (0.6, 0.5), half_width = 0.1, half_height = 0.1
    right_iris_x = 0.6 + iris_offset_x * 0.1
    right_iris_y = 0.5 + iris_offset_y * 0.1
    landmarks[473] = MockLandmark(x=right_iris_x, y=right_iris_y)

    return landmarks


# =============================================================================
# Face Analyzer Tests
# =============================================================================


class TestComputeEyeContact:
    """Tests for compute_eye_contact function."""

    def test_centered_iris_returns_high_score(self):
        landmarks = _set_eye_landmarks(_make_landmarks(), iris_offset_x=0.0)
        score = compute_eye_contact(landmarks)
        assert score is not None
        assert score >= 0.8

    def test_iris_at_boundary_returns_low_score(self):
        landmarks = _set_eye_landmarks(_make_landmarks(), iris_offset_x=1.0)
        score = compute_eye_contact(landmarks)
        assert score is not None
        assert score <= 0.3

    def test_iris_offset_vertically_returns_lower_score(self):
        landmarks = _set_eye_landmarks(
            _make_landmarks(), iris_offset_x=0.0, iris_offset_y=0.8
        )
        score = compute_eye_contact(landmarks)
        assert score is not None
        assert score < 0.5

    def test_insufficient_landmarks_returns_none(self):
        landmarks = _make_landmarks(count=400)
        score = compute_eye_contact(landmarks)
        assert score is None

    def test_score_between_zero_and_one(self):
        for offset in [0.0, 0.3, 0.5, 0.7, 1.0]:
            landmarks = _set_eye_landmarks(_make_landmarks(), iris_offset_x=offset)
            score = compute_eye_contact(landmarks)
            assert score is not None
            assert 0.0 <= score <= 1.0


class TestComputeFacialEnergy:
    """Tests for compute_facial_energy function."""

    def test_no_previous_frame_returns_none(self):
        landmarks = _make_landmarks()
        energy = compute_facial_energy(landmarks, None)
        assert energy is None

    def test_static_face_returns_low_energy(self):
        current = _make_landmarks()
        previous = _make_landmarks()
        energy = compute_facial_energy(current, previous)
        assert energy is not None
        assert energy <= 0.1

    def test_moving_face_returns_high_energy(self):
        previous = _make_landmarks()
        current = _make_landmarks()
        # Move expressive landmarks significantly
        from app.prerecorded.face_analyzer import EXPRESSIVE_LANDMARKS

        for idx in EXPRESSIVE_LANDMARKS:
            if idx < len(current):
                current[idx] = MockLandmark(x=0.5 + 0.05, y=0.5 + 0.05)
        energy = compute_facial_energy(current, previous)
        assert energy is not None
        assert energy >= 0.7

    def test_mismatched_lengths_returns_none(self):
        current = _make_landmarks(478)
        previous = _make_landmarks(400)
        energy = compute_facial_energy(current, previous)
        assert energy is None

    def test_energy_between_zero_and_one(self):
        previous = _make_landmarks()
        current = _make_landmarks()
        # Small movement
        current[70] = MockLandmark(x=0.52, y=0.52)
        energy = compute_facial_energy(current, previous)
        assert energy is not None
        assert 0.0 <= energy <= 1.0


# =============================================================================
# Video Processor Tests
# =============================================================================


def _make_pcm_silence(duration_s: float = 1.0, sample_rate: int = 16000) -> bytes:
    """Create silent PCM audio data (16-bit LE mono)."""
    num_samples = int(sample_rate * duration_s)
    return struct.pack(f"<{num_samples}h", *([0] * num_samples))


class TestVideoProcessor:
    """Tests for video processing pipeline."""

    @pytest.mark.asyncio
    async def test_process_creates_session_with_pre_recorded_type(self):
        from app.prerecorded.video_processor import VideoProcessor

        processor = VideoProcessor()

        # Mock all external dependencies
        with (
            patch.object(processor, "_extract_audio") as mock_audio,
            patch.object(processor, "_extract_frames") as mock_frames,
            patch.object(processor, "_analyze_face") as mock_face,
        ):
            # Return minimal data
            silence = _make_pcm_silence(2.0)
            mock_audio.return_value = silence
            mock_frames.return_value = [
                (0, MagicMock()),  # (timestamp_ms, frame)
                (1000, MagicMock()),
            ]
            mock_face.return_value = FaceMetrics(eye_contact=0.8, facial_energy=0.5)

            result = await processor.process(
                tutor_video_path="/tmp/tutor.mp4",
                student_video_path="/tmp/student.mp4",
                session_id="test-session",
                timestamp_offset_ms=0,
                processing_speed=1,
            )

        assert result["session_id"] == "test-session"
        assert len(result["snapshots"]) > 0

    @pytest.mark.asyncio
    async def test_process_applies_timestamp_offset(self):
        from app.prerecorded.video_processor import VideoProcessor

        processor = VideoProcessor()

        with (
            patch.object(processor, "_extract_audio") as mock_audio,
            patch.object(processor, "_extract_frames") as mock_frames,
            patch.object(processor, "_analyze_face") as mock_face,
        ):
            silence = _make_pcm_silence(3.0)
            mock_audio.return_value = silence
            mock_frames.return_value = [
                (0, MagicMock()),
                (1000, MagicMock()),
                (2000, MagicMock()),
            ]
            mock_face.return_value = FaceMetrics(eye_contact=0.7, facial_energy=0.4)

            result = await processor.process(
                tutor_video_path="/tmp/tutor.mp4",
                student_video_path="/tmp/student.mp4",
                session_id="test-session",
                timestamp_offset_ms=1000,
                processing_speed=1,
            )

        # With 1s offset, student metrics should start 1s into the video
        snapshots = result["snapshots"]
        assert len(snapshots) >= 1

    @pytest.mark.asyncio
    async def test_process_speed_affects_sample_count(self):
        from app.prerecorded.video_processor import VideoProcessor

        processor = VideoProcessor()

        for speed in [1, 2, 4]:
            with (
                patch.object(processor, "_extract_audio") as mock_audio,
                patch.object(processor, "_extract_frames") as mock_frames,
                patch.object(processor, "_analyze_face") as mock_face,
            ):
                silence = _make_pcm_silence(4.0)
                mock_audio.return_value = silence
                # Simulate frames at different intervals based on speed
                interval_ms = 1000 * speed
                frames = [(t, MagicMock()) for t in range(0, 4000, interval_ms)]
                mock_frames.return_value = frames
                mock_face.return_value = FaceMetrics(
                    eye_contact=0.8, facial_energy=0.5
                )

                result = await processor.process(
                    tutor_video_path="/tmp/tutor.mp4",
                    student_video_path="/tmp/student.mp4",
                    session_id=f"test-{speed}x",
                    timestamp_offset_ms=0,
                    processing_speed=speed,
                )

            # Higher speed → fewer snapshots
            if speed == 1:
                count_1x = len(result["snapshots"])
            elif speed == 4:
                assert len(result["snapshots"]) < count_1x

    @pytest.mark.asyncio
    async def test_process_handles_no_face_detected(self):
        from app.prerecorded.video_processor import VideoProcessor

        processor = VideoProcessor()

        with (
            patch.object(processor, "_extract_audio") as mock_audio,
            patch.object(processor, "_extract_frames") as mock_frames,
            patch.object(processor, "_analyze_face") as mock_face,
        ):
            silence = _make_pcm_silence(1.0)
            mock_audio.return_value = silence
            mock_frames.return_value = [(0, MagicMock())]
            mock_face.return_value = FaceMetrics(eye_contact=None, facial_energy=None)

            result = await processor.process(
                tutor_video_path="/tmp/tutor.mp4",
                student_video_path="/tmp/student.mp4",
                session_id="test-no-face",
                timestamp_offset_ms=0,
                processing_speed=1,
            )

        assert len(result["snapshots"]) >= 1
        # Null eye contact should be in the snapshot
        snap = result["snapshots"][0]
        assert snap["tutor_eye_contact"] is None


# =============================================================================
# Upload Router Tests
# =============================================================================


@pytest.fixture
async def upload_db_session():
    """In-memory SQLite async session for upload tests."""
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
async def upload_tutor(upload_db_session):
    """Create a test tutor for upload tests."""
    t = Tutor(
        id=uuid.uuid4(),
        google_id="g-upload-test",
        name="Upload Tutor",
        email="upload@test.com",
        preferences={},
    )
    upload_db_session.add(t)
    await upload_db_session.commit()
    return t


@pytest.fixture
async def upload_token(upload_tutor):
    """JWT for the upload test tutor."""
    return create_access_token(tutor_id=str(upload_tutor.id))


@pytest.fixture
async def upload_client(upload_db_session):
    """Async HTTP test client with DB override for upload tests."""
    from app.database import get_db
    from app.main import app

    async def override_get_db():
        yield upload_db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


class TestUploadRouter:
    """Tests for the pre-recorded upload endpoint."""

    @pytest.mark.asyncio
    async def test_upload_creates_session_and_returns_id(
        self, upload_client, upload_token
    ):
        fake_video = b"\x00" * 1024

        with patch("app.prerecorded.router.process_upload") as mock_process:
            mock_process.return_value = None

            response = await upload_client.post(
                "/sessions/upload",
                headers={"Authorization": f"Bearer {upload_token}"},
                files={
                    "tutor_video": ("tutor.mp4", fake_video, "video/mp4"),
                    "student_video": ("student.mp4", fake_video, "video/mp4"),
                },
                data={
                    "timestamp_offset_ms": "0",
                    "processing_speed": "2",
                },
            )

        assert response.status_code == 201
        data = response.json()
        assert "session_id" in data
        assert data["session_type"] == "pre_recorded"
        assert data["status"] == "processing"

    @pytest.mark.asyncio
    async def test_upload_rejects_without_auth(self, upload_client):
        fake_video = b"\x00" * 1024

        response = await upload_client.post(
            "/sessions/upload",
            files={
                "tutor_video": ("tutor.mp4", fake_video, "video/mp4"),
                "student_video": ("student.mp4", fake_video, "video/mp4"),
            },
        )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_upload_rejects_invalid_speed(self, upload_client, upload_token):
        fake_video = b"\x00" * 1024

        response = await upload_client.post(
            "/sessions/upload",
            headers={"Authorization": f"Bearer {upload_token}"},
            files={
                "tutor_video": ("tutor.mp4", fake_video, "video/mp4"),
                "student_video": ("student.mp4", fake_video, "video/mp4"),
            },
            data={
                "timestamp_offset_ms": "0",
                "processing_speed": "3",  # Invalid — must be 1, 2, or 4
            },
        )

        assert response.status_code == 422
