"""Video processing pipeline for pre-recorded session analysis.

Extracts frames and audio from two video files (tutor + student),
runs them through the same metric pipeline as live sessions,
and produces MetricSnapshot data.
"""

from __future__ import annotations

import base64
import logging
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import cv2

from app.audio.prosody import ProsodyAnalyzer
from app.audio.vad import VadAnalyzer
from app.metrics.energy import EnergyScorer
from app.metrics.interruptions import InterruptionDetector
from app.metrics.talk_time import TalkTimeTracker
from app.prerecorded.face_analyzer import FaceMetrics, compute_eye_contact, compute_facial_energy

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16000
BYTES_PER_SAMPLE = 2  # 16-bit PCM


class VideoProcessor:
    """Processes two pre-recorded video files through the engagement metric pipeline.

    Extracts frames for face analysis and audio for VAD/prosody,
    then combines results into metric snapshots matching the live session format.
    """

    def __init__(self) -> None:
        self._vad = VadAnalyzer()
        self._prosody = ProsodyAnalyzer()
        self._energy = EnergyScorer()
        self._talk_time = TalkTimeTracker()
        self._interruptions = InterruptionDetector()
        self._face_mesh = None  # Lazy init to avoid import cost in tests
        self._prev_landmarks: dict[str, list] = {}

    async def process(
        self,
        tutor_video_path: str,
        student_video_path: str,
        session_id: str,
        timestamp_offset_ms: int = 0,
        processing_speed: int = 1,
    ) -> dict[str, Any]:
        """Process two video files and produce metric snapshots.

        Args:
            tutor_video_path: Path to tutor's video file.
            student_video_path: Path to student's video file.
            timestamp_offset_ms: Offset to apply to student video (ms).
            processing_speed: Processing speed multiplier (1, 2, or 4).
                Higher values sample fewer frames for faster processing.

        Returns:
            Dict with session_id and list of metric snapshots.
        """
        import asyncio

        return await asyncio.to_thread(
            self._process_sync,
            tutor_video_path, student_video_path, session_id,
            timestamp_offset_ms, processing_speed,
        )

    def _process_sync(
        self,
        tutor_video_path: str,
        student_video_path: str,
        session_id: str,
        timestamp_offset_ms: int = 0,
        processing_speed: int = 1,
    ) -> dict[str, Any]:
        """Synchronous video processing (runs in a thread)."""
        sample_interval_ms = 1000 * processing_speed

        # Extract audio from both videos
        tutor_audio = self._extract_audio(tutor_video_path)
        student_audio = self._extract_audio(student_video_path)

        # Extract frames at the sample interval
        tutor_frames = self._extract_frames(tutor_video_path, sample_interval_ms)
        student_frames = self._extract_frames(student_video_path, sample_interval_ms)

        # Build frame lookup by timestamp for student (with offset applied)
        student_frame_map: dict[int, Any] = {}
        for ts_ms, frame in student_frames:
            adjusted_ts = ts_ms + timestamp_offset_ms
            student_frame_map[adjusted_ts] = frame

        # Determine total duration from tutor frames
        tutor_frame_map: dict[int, Any] = {ts: frame for ts, frame in tutor_frames}
        all_timestamps = sorted(set(tutor_frame_map.keys()) | set(student_frame_map.keys()))

        if not all_timestamps:
            return {"session_id": session_id, "snapshots": []}

        # Process each time step
        snapshots: list[dict[str, Any]] = []

        for ts_ms in all_timestamps:
            # Face analysis for tutor
            tutor_face = FaceMetrics(eye_contact=None, facial_energy=None)
            if ts_ms in tutor_frame_map:
                tutor_face = self._analyze_face(tutor_frame_map[ts_ms])

            # Face analysis for student
            student_face = FaceMetrics(eye_contact=None, facial_energy=None)
            if ts_ms in student_frame_map:
                student_face = self._analyze_face(student_frame_map[ts_ms])

            # Audio analysis for tutor
            tutor_prosody, tutor_is_speech = self._analyze_audio(
                tutor_audio, ts_ms, sample_interval_ms, session_id, "tutor",
            )

            # Audio analysis for student (with offset)
            student_audio_ts = ts_ms - timestamp_offset_ms
            student_prosody, student_is_speech = self._analyze_audio(
                student_audio, student_audio_ts, sample_interval_ms, session_id, "student",
            )

            # Interruption detection
            self._interruptions.update(
                session_id, tutor_is_speech, student_is_speech, ts_ms
            )

            # Energy scoring
            tutor_energy = self._energy.compute(
                tutor_prosody, tutor_face.facial_energy
            )
            student_energy = self._energy.compute(
                student_prosody, student_face.facial_energy
            )

            # Build snapshot
            interruption_counts = self._interruptions.get_counts(session_id)
            snapshot = {
                "tutor_eye_contact": tutor_face.eye_contact,
                "student_eye_contact": student_face.eye_contact,
                "tutor_talk_pct": self._talk_time.get_talk_pct(session_id, "tutor"),
                "student_talk_pct": self._talk_time.get_talk_pct(session_id, "student"),
                "interruption_count": interruption_counts["total"],
                "tutor_energy": tutor_energy,
                "student_energy": student_energy,
                "tutor_attention_drift": False,
                "student_attention_drift": False,
                "drift_reason": None,
                "timestamp_ms": ts_ms,
            }
            snapshots.append(snapshot)

        return {"session_id": session_id, "snapshots": snapshots}

    def _analyze_audio(
        self,
        audio_data: bytes,
        start_ms: int,
        duration_ms: int,
        session_id: str,
        role: str,
    ) -> tuple[dict[str, float] | None, bool]:
        """Analyze an audio chunk for VAD, talk time, and prosody.

        Args:
            audio_data: Complete raw PCM audio bytes.
            start_ms: Start position in milliseconds.
            duration_ms: Duration of chunk in milliseconds.
            session_id: Session identifier for talk time tracking.
            role: Participant role ("tutor" or "student").

        Returns:
            Tuple of (prosody_result, is_speech).
        """
        chunk = self._get_audio_chunk(audio_data, start_ms, duration_ms)
        if not chunk:
            return None, False

        b64 = base64.b64encode(chunk).decode()
        vad_result = self._vad.analyze_chunk(b64)
        self._talk_time.update(
            session_id, role,
            speech_frames=vad_result["speech_frames"],
            total_frames=vad_result["total_frames"],
        )
        prosody = self._prosody.analyze(b64)
        return prosody, vad_result["is_speech"]

    def _extract_audio(self, video_path: str) -> bytes:
        """Extract audio from video file as raw 16kHz 16-bit LE mono PCM.

        Args:
            video_path: Path to the video file.

        Returns:
            Raw PCM bytes.
        """
        with tempfile.NamedTemporaryFile(suffix=".raw", delete=True) as tmp:
            try:
                subprocess.run(
                    [
                        "ffmpeg", "-i", video_path,
                        "-ar", str(SAMPLE_RATE),
                        "-ac", "1",
                        "-f", "s16le",
                        "-acodec", "pcm_s16le",
                        tmp.name,
                        "-y", "-loglevel", "error",
                    ],
                    check=True,
                    capture_output=True,
                )
                return Path(tmp.name).read_bytes()
            except (subprocess.CalledProcessError, FileNotFoundError):
                logger.warning("Failed to extract audio from %s", video_path)
                return b""

    def _extract_frames(
        self, video_path: str, sample_interval_ms: int
    ) -> list[tuple[int, Any]]:
        """Extract video frames at the given interval.

        Args:
            video_path: Path to the video file.
            sample_interval_ms: Interval between frames in milliseconds.

        Returns:
            List of (timestamp_ms, frame) tuples.
        """
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logger.warning("Failed to open video: %s", video_path)
            return []

        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps <= 0:
            cap.release()
            return []

        frame_interval = max(1, int(fps * sample_interval_ms / 1000))
        frames: list[tuple[int, Any]] = []
        frame_num = 0

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            if frame_num % frame_interval == 0:
                timestamp_ms = int(frame_num / fps * 1000)
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                frames.append((timestamp_ms, rgb_frame))
            frame_num += 1

        cap.release()
        return frames

    def _analyze_face(self, frame: Any) -> FaceMetrics:
        """Run MediaPipe Face Mesh on a frame and compute metrics.

        Args:
            frame: RGB numpy array.

        Returns:
            FaceMetrics with eye_contact and facial_energy.
        """
        if self._face_mesh is None:
            self._init_face_mesh()

        try:
            results = self._face_mesh.process(frame)
            if not results.multi_face_landmarks:
                return FaceMetrics(eye_contact=None, facial_energy=None)

            landmarks = results.multi_face_landmarks[0].landmark
            eye_contact = compute_eye_contact(landmarks)

            # Compute facial energy from frame-to-frame displacement
            facial_energy = compute_facial_energy(
                list(landmarks),
                self._prev_landmarks.get("current"),
            )
            self._prev_landmarks["current"] = list(landmarks)

            return FaceMetrics(eye_contact=eye_contact, facial_energy=facial_energy)
        except Exception:
            logger.exception("Face analysis failed")
            return FaceMetrics(eye_contact=None, facial_energy=None)

    def _init_face_mesh(self) -> None:
        """Initialize MediaPipe Face Mesh (lazy to avoid import cost in tests)."""
        import mediapipe as mp

        self._face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
        )

    def _get_audio_chunk(
        self, audio_data: bytes, start_ms: int, duration_ms: int
    ) -> bytes | None:
        """Extract an audio chunk from raw PCM data.

        Args:
            audio_data: Complete raw PCM audio bytes.
            start_ms: Start position in milliseconds.
            duration_ms: Duration of chunk in milliseconds.

        Returns:
            PCM bytes for the chunk, or None if out of range.
        """
        if not audio_data:
            return None

        bytes_per_ms = SAMPLE_RATE * BYTES_PER_SAMPLE // 1000
        start_byte = start_ms * bytes_per_ms
        end_byte = (start_ms + duration_ms) * bytes_per_ms

        if start_byte < 0 or start_byte >= len(audio_data):
            return None

        end_byte = min(end_byte, len(audio_data))
        chunk = audio_data[start_byte:end_byte]

        if len(chunk) < bytes_per_ms * 20:  # Less than 20ms
            return None

        return chunk

    def close(self) -> None:
        """Release resources."""
        if self._face_mesh is not None:
            self._face_mesh.close()
            self._face_mesh = None
