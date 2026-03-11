"""Tests for WebRTC VAD audio analysis and talk time balance computation."""

from __future__ import annotations

import base64
import struct

from app.audio.vad import VadAnalyzer
from app.metrics.talk_time import TalkTimeTracker, WINDOW_MS

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
    """Unit tests for rolling-window talk time percentage computation."""

    def test_initial_state_returns_none(self):
        tracker = TalkTimeTracker()
        assert tracker.get_talk_pct("session-1", "tutor") is None
        assert tracker.get_talk_pct("session-1", "student") is None

    def test_update_with_speech_increases_talk_pct(self):
        tracker = TalkTimeTracker()
        tracker.update("session-1", "tutor", speech_frames=10, total_frames=10, timestamp_ms=1000)
        pct = tracker.get_talk_pct("session-1", "tutor")
        assert pct is not None
        assert abs(pct - 100.0) < 0.1

    def test_update_with_silence_gives_zero(self):
        tracker = TalkTimeTracker()
        tracker.update("session-1", "tutor", speech_frames=0, total_frames=10, timestamp_ms=1000)
        pct = tracker.get_talk_pct("session-1", "tutor")
        assert pct is not None
        assert abs(pct - 0.0) < 0.1

    def test_running_average_across_updates(self):
        tracker = TalkTimeTracker()
        tracker.update("session-1", "tutor", speech_frames=10, total_frames=10, timestamp_ms=1000)
        tracker.update("session-1", "tutor", speech_frames=0, total_frames=10, timestamp_ms=2000)
        pct = tracker.get_talk_pct("session-1", "tutor")
        assert pct is not None
        assert abs(pct - 50.0) < 0.1

    def test_tracks_tutor_and_student_separately(self):
        tracker = TalkTimeTracker()
        tracker.update("session-1", "tutor", speech_frames=8, total_frames=10, timestamp_ms=1000)
        tracker.update("session-1", "student", speech_frames=4, total_frames=10, timestamp_ms=1000)

        tutor_pct = tracker.get_talk_pct("session-1", "tutor")
        student_pct = tracker.get_talk_pct("session-1", "student")
        assert tutor_pct is not None
        assert student_pct is not None
        assert abs(tutor_pct - 80.0) < 0.1
        assert abs(student_pct - 40.0) < 0.1

    def test_tracks_sessions_separately(self):
        tracker = TalkTimeTracker()
        tracker.update("session-1", "tutor", speech_frames=10, total_frames=10, timestamp_ms=1000)
        tracker.update("session-2", "tutor", speech_frames=0, total_frames=10, timestamp_ms=1000)

        assert abs(tracker.get_talk_pct("session-1", "tutor") - 100.0) < 0.1
        assert abs(tracker.get_talk_pct("session-2", "tutor") - 0.0) < 0.1

    def test_sixty_forty_scenario(self):
        """Tutor 60% / student 40% scenario within ±5% accuracy."""
        tracker = TalkTimeTracker()
        for i in range(10):
            ts = 1000 + i * 1000
            tutor_speech = 100 if i < 6 else 0
            student_speech = 100 if i >= 6 else 0
            tracker.update("session-1", "tutor", speech_frames=tutor_speech, total_frames=100, timestamp_ms=ts)
            tracker.update("session-1", "student", speech_frames=student_speech, total_frames=100, timestamp_ms=ts)

        tutor_pct = tracker.get_talk_pct("session-1", "tutor")
        student_pct = tracker.get_talk_pct("session-1", "student")
        assert abs(tutor_pct - 60.0) <= 5.0
        assert abs(student_pct - 40.0) <= 5.0

    def test_missing_channel_returns_none(self):
        tracker = TalkTimeTracker()
        tracker.update("session-1", "tutor", speech_frames=10, total_frames=10, timestamp_ms=1000)
        assert tracker.get_talk_pct("session-1", "student") is None

    def test_clear_session(self):
        tracker = TalkTimeTracker()
        tracker.update("session-1", "tutor", speech_frames=10, total_frames=10, timestamp_ms=1000)
        tracker.clear_session("session-1")
        assert tracker.get_talk_pct("session-1", "tutor") is None

    def test_old_entries_pruned_from_window(self):
        """Entries older than WINDOW_MS are dropped from the rolling window."""
        tracker = TalkTimeTracker()
        # 100% speech at t=0
        tracker.update("s1", "tutor", speech_frames=100, total_frames=100, timestamp_ms=0)
        # 0% speech at t=WINDOW_MS+1 (old entry should be pruned)
        tracker.update("s1", "tutor", speech_frames=0, total_frames=100, timestamp_ms=WINDOW_MS + 1)

        pct = tracker.get_talk_pct("s1", "tutor")
        assert pct is not None
        # Only the recent silent entry remains
        assert abs(pct - 0.0) < 0.1

    def test_window_reflects_recent_behavior(self):
        """After a long session, talk time reflects only the last 2 minutes."""
        tracker = TalkTimeTracker()
        # 5 minutes of 100% speech (all outside window at end)
        for i in range(300):
            tracker.update("s1", "tutor", speech_frames=100, total_frames=100, timestamp_ms=i * 1000)

        # Then 2 minutes of silence (inside window)
        for i in range(120):
            ts = 300_000 + i * 1000
            tracker.update("s1", "tutor", speech_frames=0, total_frames=100, timestamp_ms=ts)

        pct = tracker.get_talk_pct("s1", "tutor")
        assert pct is not None
        # Should reflect recent silence, not the earlier speech
        assert pct < 5.0
