"""Tests for WebRTC VAD audio analysis and talk time balance computation."""

from __future__ import annotations

import base64
import struct

from app.audio.vad import VadAnalyzer
from app.metrics.talk_time import TalkTimeTracker

# --- VadAnalyzer unit tests ---


class TestVadAnalyzer:
    """Unit tests for VAD speech/non-speech classification."""

    def test_silence_classified_as_non_speech(self):
        vad = VadAnalyzer()
        # 1 second of silence at 16kHz, 16-bit mono = 32000 bytes
        pcm_data = b"\x00" * 32000
        b64 = base64.b64encode(pcm_data).decode()
        result = vad.analyze_chunk(b64)
        assert result["is_speech"] is False
        assert 0.0 <= result["speech_ratio"] <= 0.1

    def test_loud_signal_classified_as_speech(self):
        vad = VadAnalyzer()
        # 1 second of loud signal at 16kHz — alternating high amplitude samples
        samples = []
        for i in range(16000):
            # Generate a ~440Hz tone
            import math
            val = int(16000 * math.sin(2 * math.pi * 440 * i / 16000))
            samples.append(val)
        pcm_data = struct.pack(f"<{len(samples)}h", *samples)
        b64 = base64.b64encode(pcm_data).decode()
        result = vad.analyze_chunk(b64)
        assert result["is_speech"] is True
        assert result["speech_ratio"] >= 0.5

    def test_returns_frame_count(self):
        vad = VadAnalyzer()
        # 1 second at 16kHz = 100 frames of 10ms
        pcm_data = b"\x00" * 32000
        b64 = base64.b64encode(pcm_data).decode()
        result = vad.analyze_chunk(b64)
        assert result["total_frames"] > 0
        assert result["speech_frames"] >= 0
        assert result["speech_frames"] <= result["total_frames"]

    def test_empty_data_returns_non_speech(self):
        vad = VadAnalyzer()
        b64 = base64.b64encode(b"").decode()
        result = vad.analyze_chunk(b64)
        assert result["is_speech"] is False
        assert result["speech_ratio"] == 0.0
        assert result["total_frames"] == 0

    def test_short_data_handled_gracefully(self):
        vad = VadAnalyzer()
        # Less than one frame (10ms at 16kHz = 320 bytes)
        pcm_data = b"\x00" * 100
        b64 = base64.b64encode(pcm_data).decode()
        result = vad.analyze_chunk(b64)
        assert result["is_speech"] is False
        assert result["total_frames"] == 0


# --- TalkTimeTracker unit tests ---


class TestTalkTimeTracker:
    """Unit tests for running talk time percentage computation."""

    def test_initial_state_returns_none(self):
        tracker = TalkTimeTracker()
        assert tracker.get_talk_pct("session-1", "tutor") is None
        assert tracker.get_talk_pct("session-1", "student") is None

    def test_update_with_speech_increases_talk_pct(self):
        tracker = TalkTimeTracker()
        # 10 speech frames out of 10 total
        tracker.update("session-1", "tutor", speech_frames=10, total_frames=10)
        pct = tracker.get_talk_pct("session-1", "tutor")
        assert pct is not None
        assert abs(pct - 100.0) < 0.1

    def test_update_with_silence_gives_zero(self):
        tracker = TalkTimeTracker()
        tracker.update("session-1", "tutor", speech_frames=0, total_frames=10)
        pct = tracker.get_talk_pct("session-1", "tutor")
        assert pct is not None
        assert abs(pct - 0.0) < 0.1

    def test_running_average_across_updates(self):
        tracker = TalkTimeTracker()
        # First update: 100% speech
        tracker.update("session-1", "tutor", speech_frames=10, total_frames=10)
        # Second update: 0% speech
        tracker.update("session-1", "tutor", speech_frames=0, total_frames=10)
        pct = tracker.get_talk_pct("session-1", "tutor")
        assert pct is not None
        assert abs(pct - 50.0) < 0.1

    def test_tracks_tutor_and_student_separately(self):
        tracker = TalkTimeTracker()
        tracker.update("session-1", "tutor", speech_frames=8, total_frames=10)
        tracker.update("session-1", "student", speech_frames=4, total_frames=10)

        tutor_pct = tracker.get_talk_pct("session-1", "tutor")
        student_pct = tracker.get_talk_pct("session-1", "student")
        assert tutor_pct is not None
        assert student_pct is not None
        assert abs(tutor_pct - 80.0) < 0.1
        assert abs(student_pct - 40.0) < 0.1

    def test_tracks_sessions_separately(self):
        tracker = TalkTimeTracker()
        tracker.update("session-1", "tutor", speech_frames=10, total_frames=10)
        tracker.update("session-2", "tutor", speech_frames=0, total_frames=10)

        assert abs(tracker.get_talk_pct("session-1", "tutor") - 100.0) < 0.1
        assert abs(tracker.get_talk_pct("session-2", "tutor") - 0.0) < 0.1

    def test_sixty_forty_scenario(self):
        """Tutor 60% / student 40% scenario within ±5% accuracy."""
        tracker = TalkTimeTracker()
        # Simulate 10 updates: tutor speaks in 6, student in 4
        for i in range(10):
            tutor_speech = 100 if i < 6 else 0
            student_speech = 100 if i >= 6 else 0
            tracker.update("session-1", "tutor", speech_frames=tutor_speech, total_frames=100)
            tracker.update("session-1", "student", speech_frames=student_speech, total_frames=100)

        tutor_pct = tracker.get_talk_pct("session-1", "tutor")
        student_pct = tracker.get_talk_pct("session-1", "student")
        assert abs(tutor_pct - 60.0) <= 5.0
        assert abs(student_pct - 40.0) <= 5.0

    def test_missing_channel_returns_none(self):
        tracker = TalkTimeTracker()
        tracker.update("session-1", "tutor", speech_frames=10, total_frames=10)
        assert tracker.get_talk_pct("session-1", "student") is None

    def test_clear_session(self):
        tracker = TalkTimeTracker()
        tracker.update("session-1", "tutor", speech_frames=10, total_frames=10)
        tracker.clear_session("session-1")
        assert tracker.get_talk_pct("session-1", "tutor") is None
