"""Pre-recorded video upload and processing endpoint."""

from __future__ import annotations

import logging
import shutil
import tempfile
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_tutor
from app.database import async_session_factory, get_db
from app.models.models import (
    MetricSnapshot,
    Session,
    SessionStatus,
    SessionType,
    Tutor,
)
from app.prerecorded.video_processor import VideoProcessor

logger = logging.getLogger(__name__)

router = APIRouter(tags=["prerecorded"])

ALLOWED_EXTENSIONS = {".mp4", ".webm", ".avi", ".mov", ".mkv"}
VALID_SPEEDS = {1, 2, 4}


class UploadResponse(BaseModel):
    """Response from uploading pre-recorded videos."""

    session_id: str
    session_type: str
    status: str


def _generate_join_code() -> str:
    """Generate a 6-character alphanumeric join code for the session."""
    import secrets
    import string

    chars = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(chars) for _ in range(6))


async def process_upload(
    session_id: uuid.UUID,
    tutor_video_path: str,
    student_video_path: str,
    timestamp_offset_ms: int,
    processing_speed: int,
) -> None:
    """Background task that processes uploaded videos and saves metric snapshots.

    Args:
        session_id: Session UUID.
        tutor_video_path: Path to saved tutor video file.
        student_video_path: Path to saved student video file.
        timestamp_offset_ms: Offset to apply to student video.
        processing_speed: Processing speed multiplier (1, 2, or 4).
    """
    processor = VideoProcessor()
    try:
        result = await processor.process(
            tutor_video_path=tutor_video_path,
            student_video_path=student_video_path,
            session_id=str(session_id),
            timestamp_offset_ms=timestamp_offset_ms,
            processing_speed=processing_speed,
        )

        # Save snapshots to database
        async with async_session_factory() as db:
            for snap_data in result["snapshots"]:
                timestamp_ms = snap_data.pop("timestamp_ms")
                snapshot = MetricSnapshot(
                    id=uuid.uuid4(),
                    session_id=session_id,
                    timestamp_ms=timestamp_ms,
                    metrics=snap_data,
                )
                db.add(snapshot)

            # Mark session as completed
            from sqlalchemy import select

            sess_result = await db.execute(
                select(Session).where(Session.id == session_id)
            )
            session = sess_result.scalar_one_or_none()
            if session:
                session.status = SessionStatus.COMPLETED
                session.end_time = datetime.now(UTC)

            await db.commit()

        logger.info(
            "Processed pre-recorded session %s: %d snapshots",
            session_id,
            len(result["snapshots"]),
        )
    except Exception:
        logger.exception("Failed to process pre-recorded session %s", session_id)
        # Mark session as completed even on failure
        async with async_session_factory() as db:
            from sqlalchemy import select

            sess_result = await db.execute(
                select(Session).where(Session.id == session_id)
            )
            session = sess_result.scalar_one_or_none()
            if session:
                session.status = SessionStatus.COMPLETED
                session.end_time = datetime.now(UTC)
            await db.commit()
    finally:
        processor.close()
        # Clean up temp files
        for path in [tutor_video_path, student_video_path]:
            try:
                Path(path).unlink(missing_ok=True)
            except Exception:
                pass


@router.post("/sessions/upload", response_model=UploadResponse, status_code=201)
async def upload_videos(
    background_tasks: BackgroundTasks,
    tutor_video: UploadFile = File(...),
    student_video: UploadFile = File(...),
    timestamp_offset_ms: Annotated[int, Form()] = 0,
    processing_speed: Annotated[int, Form()] = 1,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Upload two video files for pre-recorded session analysis.

    Creates a session with type 'pre_recorded' and starts background processing.

    Args:
        tutor_video: Tutor's video file (mp4, webm).
        student_video: Student's video file (mp4, webm).
        timestamp_offset_ms: Offset for student video alignment (default 0).
        processing_speed: Processing speed: 1 (normal), 2 (2x), or 4 (4x).
    """
    # Validate processing speed
    if processing_speed not in VALID_SPEEDS:
        raise HTTPException(
            status_code=422,
            detail=f"processing_speed must be one of {sorted(VALID_SPEEDS)}",
        )

    # Validate file types
    for upload, label in [(tutor_video, "tutor_video"), (student_video, "student_video")]:
        if upload.filename:
            ext = Path(upload.filename).suffix.lower()
            if ext not in ALLOWED_EXTENSIONS:
                raise HTTPException(
                    status_code=422,
                    detail=f"{label} must be a video file "
                    f"({', '.join(sorted(ALLOWED_EXTENSIONS))})",
                )

    # Create session
    session_id = uuid.uuid4()
    now = datetime.now(UTC)

    session = Session(
        id=session_id,
        tutor_id=tutor.id,
        join_code=_generate_join_code(),
        status=SessionStatus.ACTIVE,
        session_type=SessionType.PRE_RECORDED,
        student_display_name="Pre-recorded",
        start_time=now,
        join_time=now,
    )
    db.add(session)
    await db.commit()

    # Save uploaded files to temp directory
    upload_dir = Path(tempfile.mkdtemp(prefix="sonder_upload_"))
    tutor_ext = Path(tutor_video.filename or ".mp4").suffix
    student_ext = Path(student_video.filename or ".mp4").suffix
    tutor_path = upload_dir / f"tutor_{session_id}{tutor_ext}"
    student_path = upload_dir / f"student_{session_id}{student_ext}"

    with open(tutor_path, "wb") as f:
        shutil.copyfileobj(tutor_video.file, f)
    with open(student_path, "wb") as f:
        shutil.copyfileobj(student_video.file, f)

    # Launch background processing
    background_tasks.add_task(
        process_upload,
        session_id=session_id,
        tutor_video_path=str(tutor_path),
        student_video_path=str(student_path),
        timestamp_offset_ms=timestamp_offset_ms,
        processing_speed=processing_speed,
    )

    return UploadResponse(
        session_id=str(session_id),
        session_type="pre_recorded",
        status="processing",
    )
