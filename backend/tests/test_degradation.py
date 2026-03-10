"""Tests for degradation detection — face detection failure and audio timeout."""

from app.metrics.degradation import (
    AUDIO_TIMEOUT_MS,
    FACE_TIMEOUT_MS,
    DegradationChange,
    DegradationTracker,
)

SESSION = "session-1"


class TestFaceDetection:
    """Tests for face detection failure tracking."""

    def test_face_present_no_warning(self):
        tracker = DegradationTracker()
        result = tracker.update_face_status(SESSION, "student", 0.8, 1000)
        assert result is None

    def test_face_absent_under_threshold_no_warning(self):
        tracker = DegradationTracker()
        tracker.update_face_status(SESSION, "student", None, 1000)
        result = tracker.update_face_status(SESSION, "student", None, 4000)
        assert result is None

    def test_face_absent_over_threshold_activates_warning(self):
        tracker = DegradationTracker()
        tracker.update_face_status(SESSION, "student", None, 1000)
        result = tracker.update_face_status(SESSION, "student", None, 6001)
        assert result == DegradationChange(
            role="student", warning_type="face_not_detected", active=True
        )

    def test_face_absent_exactly_at_threshold_activates_warning(self):
        tracker = DegradationTracker()
        tracker.update_face_status(SESSION, "student", None, 0)
        result = tracker.update_face_status(
            SESSION, "student", None, FACE_TIMEOUT_MS
        )
        assert result is not None
        assert result.active is True

    def test_face_returns_clears_warning(self):
        tracker = DegradationTracker()
        tracker.update_face_status(SESSION, "student", None, 0)
        tracker.update_face_status(SESSION, "student", None, 6000)
        result = tracker.update_face_status(SESSION, "student", 0.7, 7000)
        assert result == DegradationChange(
            role="student", warning_type="face_not_detected", active=False
        )

    def test_face_returns_no_change_if_no_warning_active(self):
        tracker = DegradationTracker()
        result = tracker.update_face_status(SESSION, "student", 0.5, 1000)
        assert result is None

    def test_warning_fires_only_once(self):
        tracker = DegradationTracker()
        tracker.update_face_status(SESSION, "student", None, 0)
        tracker.update_face_status(SESSION, "student", None, 6000)
        # Already fired — no second event
        result = tracker.update_face_status(SESSION, "student", None, 8000)
        assert result is None

    def test_face_warning_cycle_reactivates(self):
        tracker = DegradationTracker()
        # Activate
        tracker.update_face_status(SESSION, "student", None, 0)
        tracker.update_face_status(SESSION, "student", None, 6000)
        # Clear
        tracker.update_face_status(SESSION, "student", 0.5, 7000)
        # Activate again
        tracker.update_face_status(SESSION, "student", None, 8000)
        result = tracker.update_face_status(SESSION, "student", None, 14000)
        assert result is not None
        assert result.active is True

    def test_independent_per_role(self):
        tracker = DegradationTracker()
        tracker.update_face_status(SESSION, "tutor", None, 0)
        tracker.update_face_status(SESSION, "tutor", None, 6000)
        assert tracker.is_face_degraded(SESSION, "tutor") is True
        assert tracker.is_face_degraded(SESSION, "student") is False

    def test_independent_per_session(self):
        tracker = DegradationTracker()
        tracker.update_face_status("s1", "student", None, 0)
        tracker.update_face_status("s1", "student", None, 6000)
        assert tracker.is_face_degraded("s1", "student") is True
        assert tracker.is_face_degraded("s2", "student") is False


class TestAudioTimeout:
    """Tests for audio unavailability tracking."""

    def test_no_warning_when_never_received(self):
        tracker = DegradationTracker()
        result = tracker.check_audio_timeout(SESSION, "student", 100_000)
        assert result is None

    def test_audio_chunk_received_no_warning(self):
        tracker = DegradationTracker()
        result = tracker.update_audio_status(SESSION, "student", 1000)
        assert result is None

    def test_audio_timeout_activates_warning(self):
        tracker = DegradationTracker()
        tracker.update_audio_status(SESSION, "student", 1000)
        result = tracker.check_audio_timeout(
            SESSION, "student", 1000 + AUDIO_TIMEOUT_MS
        )
        assert result == DegradationChange(
            role="student", warning_type="audio_unavailable", active=True
        )

    def test_audio_under_threshold_no_warning(self):
        tracker = DegradationTracker()
        tracker.update_audio_status(SESSION, "student", 1000)
        result = tracker.check_audio_timeout(SESSION, "student", 50_000)
        assert result is None

    def test_audio_resumes_clears_warning(self):
        tracker = DegradationTracker()
        tracker.update_audio_status(SESSION, "student", 1000)
        tracker.check_audio_timeout(SESSION, "student", 62_000)
        result = tracker.update_audio_status(SESSION, "student", 63_000)
        assert result == DegradationChange(
            role="student", warning_type="audio_unavailable", active=False
        )

    def test_audio_timeout_fires_only_once(self):
        tracker = DegradationTracker()
        tracker.update_audio_status(SESSION, "student", 1000)
        tracker.check_audio_timeout(SESSION, "student", 62_000)
        result = tracker.check_audio_timeout(SESSION, "student", 70_000)
        assert result is None

    def test_audio_independent_per_role(self):
        tracker = DegradationTracker()
        tracker.update_audio_status(SESSION, "tutor", 1000)
        tracker.check_audio_timeout(SESSION, "tutor", 62_000)
        assert tracker.is_audio_degraded(SESSION, "tutor") is True
        assert tracker.is_audio_degraded(SESSION, "student") is False


class TestIsFaceDegraded:
    """Tests for the is_face_degraded query."""

    def test_not_degraded_initially(self):
        tracker = DegradationTracker()
        assert tracker.is_face_degraded(SESSION, "student") is False

    def test_degraded_after_timeout(self):
        tracker = DegradationTracker()
        tracker.update_face_status(SESSION, "student", None, 0)
        tracker.update_face_status(SESSION, "student", None, 6000)
        assert tracker.is_face_degraded(SESSION, "student") is True

    def test_not_degraded_after_recovery(self):
        tracker = DegradationTracker()
        tracker.update_face_status(SESSION, "student", None, 0)
        tracker.update_face_status(SESSION, "student", None, 6000)
        tracker.update_face_status(SESSION, "student", 0.5, 7000)
        assert tracker.is_face_degraded(SESSION, "student") is False


class TestClearSession:
    """Tests for session cleanup."""

    def test_clear_resets_all_state(self):
        tracker = DegradationTracker()
        tracker.update_face_status(SESSION, "student", None, 0)
        tracker.update_face_status(SESSION, "student", None, 6000)
        tracker.update_audio_status(SESSION, "tutor", 1000)
        tracker.check_audio_timeout(SESSION, "tutor", 62_000)

        tracker.clear_session(SESSION)

        assert tracker.is_face_degraded(SESSION, "student") is False
        assert tracker.is_audio_degraded(SESSION, "tutor") is False


class TestNudgeExclusion:
    """Verify that nudge engine naturally excludes visual metrics during face failure.

    This tests the NudgeEngine's existing behavior with None eye contact values,
    confirming the graceful degradation requirement is met without additional logic.
    """

    def test_nudge_engine_skips_eye_contact_rule_when_none(self):
        from app.nudges.engine import NudgeEngine

        engine = NudgeEngine()
        preferences = {
            "enabled_nudges": ["student_low_eye_contact", "tutor_low_eye_contact"],
            "nudge_thresholds": {
                "eye_contact_low": 0.3,
                "eye_contact_duration_s": 30,
            },
        }

        # Send 60+ seconds of None eye contact — should NOT trigger
        for t in range(0, 35_000, 500):
            snapshot = {
                "student_eye_contact": None,
                "tutor_eye_contact": None,
                "student_talk_pct": 40.0,
                "tutor_talk_pct": 60.0,
                "interruption_count": 0,
                "student_energy": 0.5,
                "tutor_energy": 0.5,
                "tutor_attention_drift": False,
                "student_attention_drift": False,
                "drift_reason": None,
                "timestamp_ms": t,
            }
            results = engine.evaluate("s1", snapshot, preferences)
            assert len(results) == 0, (
                f"Eye contact nudge should not fire with None values at t={t}"
            )
