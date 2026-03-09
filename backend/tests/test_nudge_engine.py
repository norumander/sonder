"""Tests for the coaching nudge engine."""

import pytest

from app.nudges.engine import NudgeEngine


@pytest.fixture()
def default_preferences():
    """Default tutor preferences with all nudges enabled."""
    return {
        "enabled_nudges": [
            "student_silent",
            "student_low_eye_contact",
            "tutor_dominant",
            "student_energy_drop",
            "interruption_spike",
            "tutor_low_eye_contact",
        ],
        "nudge_thresholds": {
            "student_silent_minutes": 3,
            "eye_contact_low": 0.3,
            "eye_contact_duration_s": 30,
            "tutor_talk_pct": 0.8,
            "tutor_talk_duration_minutes": 5,
            "energy_drop_pct": 0.3,
            "interruption_count": 3,
            "interruption_window_minutes": 2,
        },
    }


@pytest.fixture()
def engine():
    return NudgeEngine()


def _make_snapshot(
    *,
    tutor_eye_contact=0.8,
    student_eye_contact=0.7,
    tutor_talk_pct=50.0,
    student_talk_pct=50.0,
    interruption_count=0,
    tutor_energy=0.6,
    student_energy=0.6,
    tutor_attention_drift=False,
    student_attention_drift=False,
    drift_reason=None,
    timestamp_ms=0,
):
    return {
        "tutor_eye_contact": tutor_eye_contact,
        "student_eye_contact": student_eye_contact,
        "tutor_talk_pct": tutor_talk_pct,
        "student_talk_pct": student_talk_pct,
        "interruption_count": interruption_count,
        "tutor_energy": tutor_energy,
        "student_energy": student_energy,
        "tutor_attention_drift": tutor_attention_drift,
        "student_attention_drift": student_attention_drift,
        "drift_reason": drift_reason,
        "timestamp_ms": timestamp_ms,
    }


# --- Rule: student_silent ---


class TestStudentSilentRule:
    def test_fires_after_3_minutes_of_silence(self, engine, default_preferences):
        """Student talk_pct 0 for >3 min → nudge fires."""
        session_id = "s1"
        # Feed snapshots for 3+ minutes (181 seconds at 1Hz)
        for i in range(181):
            ts = i * 1000
            snapshot = _make_snapshot(student_talk_pct=0.0, timestamp_ms=ts)
            results = engine.evaluate(session_id, snapshot, default_preferences)
        assert len(results) == 1
        assert results[0].nudge_type == "student_silent"
        assert "understanding" in results[0].message.lower()

    def test_does_not_fire_when_student_speaking(self, engine, default_preferences):
        session_id = "s1"
        for i in range(200):
            ts = i * 1000
            snapshot = _make_snapshot(student_talk_pct=30.0, timestamp_ms=ts)
            results = engine.evaluate(session_id, snapshot, default_preferences)
        assert all(r.nudge_type != "student_silent" for r in results)


# --- Rule: student_low_eye_contact ---


class TestStudentLowEyeContactRule:
    def test_fires_after_30s_below_threshold(self, engine, default_preferences):
        session_id = "s1"
        all_results = []
        for i in range(32):
            ts = i * 1000
            snapshot = _make_snapshot(student_eye_contact=0.2, timestamp_ms=ts)
            all_results.extend(engine.evaluate(session_id, snapshot, default_preferences))
        assert any(r.nudge_type == "student_low_eye_contact" for r in all_results)
        nudge = next(r for r in all_results if r.nudge_type == "student_low_eye_contact")
        assert "distracted" in nudge.message.lower()

    def test_does_not_fire_above_threshold(self, engine, default_preferences):
        session_id = "s1"
        for i in range(40):
            ts = i * 1000
            snapshot = _make_snapshot(student_eye_contact=0.5, timestamp_ms=ts)
            results = engine.evaluate(session_id, snapshot, default_preferences)
        assert all(r.nudge_type != "student_low_eye_contact" for r in results)


# --- Rule: tutor_dominant ---


class TestTutorDominantRule:
    def test_fires_after_5_min_above_80pct(self, engine, default_preferences):
        session_id = "s1"
        all_results = []
        for i in range(301):  # 5 min + 1s
            ts = i * 1000
            snapshot = _make_snapshot(tutor_talk_pct=85.0, timestamp_ms=ts)
            all_results.extend(engine.evaluate(session_id, snapshot, default_preferences))
        assert any(r.nudge_type == "tutor_dominant" for r in all_results)
        nudge = next(r for r in all_results if r.nudge_type == "tutor_dominant")
        assert "question" in nudge.message.lower()

    def test_does_not_fire_below_threshold(self, engine, default_preferences):
        session_id = "s1"
        for i in range(400):
            ts = i * 1000
            snapshot = _make_snapshot(tutor_talk_pct=60.0, timestamp_ms=ts)
            results = engine.evaluate(session_id, snapshot, default_preferences)
        assert all(r.nudge_type != "tutor_dominant" for r in results)


# --- Rule: student_energy_drop ---


class TestStudentEnergyDropRule:
    def test_fires_on_30pct_drop(self, engine, default_preferences):
        session_id = "s1"
        all_results = []
        # Establish 2-min baseline of energy 0.8
        for i in range(120):
            ts = i * 1000
            snapshot = _make_snapshot(student_energy=0.8, timestamp_ms=ts)
            all_results.extend(engine.evaluate(session_id, snapshot, default_preferences))
        # Drop to 0.4 (a 0.4 drop, >0.3 threshold)
        for i in range(120, 125):
            ts = i * 1000
            snapshot = _make_snapshot(student_energy=0.4, timestamp_ms=ts)
            all_results.extend(engine.evaluate(session_id, snapshot, default_preferences))
        assert any(r.nudge_type == "student_energy_drop" for r in all_results)
        nudge = next(r for r in all_results if r.nudge_type == "student_energy_drop")
        assert "break" in nudge.message.lower() or "approach" in nudge.message.lower()

    def test_does_not_fire_on_small_drop(self, engine, default_preferences):
        session_id = "s1"
        for i in range(120):
            ts = i * 1000
            snapshot = _make_snapshot(student_energy=0.8, timestamp_ms=ts)
            engine.evaluate(session_id, snapshot, default_preferences)
        results = []
        for i in range(120, 130):
            ts = i * 1000
            snapshot = _make_snapshot(student_energy=0.65, timestamp_ms=ts)
            results = engine.evaluate(session_id, snapshot, default_preferences)
        assert all(r.nudge_type != "student_energy_drop" for r in results)


# --- Rule: interruption_spike ---


class TestInterruptionSpikeRule:
    def test_fires_on_3_interruptions_in_2_min(self, engine, default_preferences):
        session_id = "s1"
        all_results = []
        # Simulate interruptions ramping up: 0 at start, 3 by 60s
        for i in range(121):
            ts = i * 1000
            count = 3 if i >= 60 else i // 30
            snapshot = _make_snapshot(interruption_count=count, timestamp_ms=ts)
            all_results.extend(engine.evaluate(session_id, snapshot, default_preferences))
        assert any(r.nudge_type == "interruption_spike" for r in all_results)
        nudge = next(r for r in all_results if r.nudge_type == "interruption_spike")
        assert "wait time" in nudge.message.lower()

    def test_does_not_fire_below_threshold(self, engine, default_preferences):
        session_id = "s1"
        results = []
        for i in range(130):
            ts = i * 1000
            snapshot = _make_snapshot(interruption_count=1, timestamp_ms=ts)
            results = engine.evaluate(session_id, snapshot, default_preferences)
        assert all(r.nudge_type != "interruption_spike" for r in results)


# --- Rule: tutor_low_eye_contact ---


class TestTutorLowEyeContactRule:
    def test_fires_after_30s_below_threshold(self, engine, default_preferences):
        session_id = "s1"
        all_results = []
        for i in range(32):
            ts = i * 1000
            snapshot = _make_snapshot(tutor_eye_contact=0.1, timestamp_ms=ts)
            all_results.extend(engine.evaluate(session_id, snapshot, default_preferences))
        assert any(r.nudge_type == "tutor_low_eye_contact" for r in all_results)
        nudge = next(r for r in all_results if r.nudge_type == "tutor_low_eye_contact")
        assert "eye contact" in nudge.message.lower()


# --- Cooldown ---


class TestCooldown:
    def test_60s_cooldown_prevents_duplicate(self, engine, default_preferences):
        session_id = "s1"
        fired_count = 0
        # Continuously trigger student_low_eye_contact for 120s
        for i in range(121):
            ts = i * 1000
            snapshot = _make_snapshot(student_eye_contact=0.1, timestamp_ms=ts)
            results = engine.evaluate(session_id, snapshot, default_preferences)
            fired_count += sum(
                1 for r in results if r.nudge_type == "student_low_eye_contact"
            )
        # Should fire once at ~30s and once at ~91s (after 60s cooldown)
        assert fired_count == 2

    def test_different_nudge_types_have_independent_cooldowns(
        self, engine, default_preferences
    ):
        session_id = "s1"
        types_fired = set()
        for i in range(35):
            ts = i * 1000
            snapshot = _make_snapshot(
                student_eye_contact=0.1,
                tutor_eye_contact=0.1,
                timestamp_ms=ts,
            )
            results = engine.evaluate(session_id, snapshot, default_preferences)
            for r in results:
                types_fired.add(r.nudge_type)
        # Both should fire independently
        assert "student_low_eye_contact" in types_fired
        assert "tutor_low_eye_contact" in types_fired


# --- Preferences ---


class TestPreferences:
    def test_disabled_nudge_does_not_fire(self, engine, default_preferences):
        prefs = {
            **default_preferences,
            "enabled_nudges": ["tutor_dominant"],  # Only tutor_dominant enabled
        }
        session_id = "s1"
        for i in range(40):
            ts = i * 1000
            snapshot = _make_snapshot(student_eye_contact=0.1, timestamp_ms=ts)
            results = engine.evaluate(session_id, snapshot, prefs)
        # student_low_eye_contact should NOT fire (disabled)
        assert all(r.nudge_type != "student_low_eye_contact" for r in results)

    def test_custom_threshold_respected(self, engine, default_preferences):
        prefs = {
            **default_preferences,
            "nudge_thresholds": {
                **default_preferences["nudge_thresholds"],
                "eye_contact_duration_s": 60,  # Raised from 30 to 60
            },
        }
        session_id = "s1"
        all_results = []
        for i in range(50):
            ts = i * 1000
            snapshot = _make_snapshot(student_eye_contact=0.1, timestamp_ms=ts)
            results = engine.evaluate(session_id, snapshot, prefs)
            all_results.extend(results)
        # Should NOT fire — only 50s, threshold is 60s
        assert all(r.nudge_type != "student_low_eye_contact" for r in all_results)


# --- NudgeResult ---


class TestNudgeResult:
    def test_result_has_required_fields(self, engine, default_preferences):
        session_id = "s1"
        all_results = []
        for i in range(32):
            ts = i * 1000
            snapshot = _make_snapshot(student_eye_contact=0.1, timestamp_ms=ts)
            all_results.extend(engine.evaluate(session_id, snapshot, default_preferences))

        nudge = next(r for r in all_results if r.nudge_type == "student_low_eye_contact")
        assert nudge.nudge_type == "student_low_eye_contact"
        assert isinstance(nudge.message, str)
        assert nudge.priority in ("low", "medium", "high")
        assert isinstance(nudge.trigger_metrics, dict)
        assert nudge.timestamp_ms > 0


# --- Session isolation ---


class TestSessionIsolation:
    def test_separate_sessions_have_independent_state(
        self, engine, default_preferences
    ):
        for i in range(32):
            ts = i * 1000
            snapshot = _make_snapshot(student_eye_contact=0.1, timestamp_ms=ts)
            engine.evaluate("session_a", snapshot, default_preferences)

        # Session B starts fresh — should not fire yet
        snapshot = _make_snapshot(student_eye_contact=0.1, timestamp_ms=0)
        results = engine.evaluate("session_b", snapshot, default_preferences)
        assert all(r.nudge_type != "student_low_eye_contact" for r in results)
