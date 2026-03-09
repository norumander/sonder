"""Tests for attention drift detection."""

from __future__ import annotations

from app.metrics.attention_drift import AttentionDriftDetector


class TestEyeContactDrift:
    """Drift flag when eye contact < 0.3 for > 15 consecutive seconds."""

    def test_low_eye_contact_20s_triggers_drift(self):
        """Eye contact < 0.3 for 20 seconds -> drift activates with reason."""
        detector = AttentionDriftDetector()
        # Feed 20 seconds of low eye contact at 500ms intervals
        for t in range(0, 20_000, 500):
            result = detector.update(
                role="student",
                eye_contact=0.2,
                energy=0.5,
                timestamp_ms=t,
            )
        assert result.drifting is True
        assert result.reason == "low_eye_contact"

    def test_low_eye_contact_10s_no_drift(self):
        """Eye contact < 0.3 for only 10 seconds -> no drift."""
        detector = AttentionDriftDetector()
        for t in range(0, 10_000, 500):
            result = detector.update(
                role="student",
                eye_contact=0.2,
                energy=0.5,
                timestamp_ms=t,
            )
        assert result.drifting is False

    def test_eye_contact_above_threshold_no_drift(self):
        """Eye contact >= 0.3 never triggers drift regardless of duration."""
        detector = AttentionDriftDetector()
        for t in range(0, 30_000, 500):
            result = detector.update(
                role="tutor",
                eye_contact=0.5,
                energy=0.5,
                timestamp_ms=t,
            )
        assert result.drifting is False

    def test_drift_clears_when_eye_contact_recovers(self):
        """Drift flag clears when eye contact goes back above threshold."""
        detector = AttentionDriftDetector()
        # Trigger drift
        for t in range(0, 20_000, 500):
            detector.update(role="student", eye_contact=0.1, energy=0.5, timestamp_ms=t)
        # Recover
        result = detector.update(
            role="student", eye_contact=0.8, energy=0.5, timestamp_ms=20_000
        )
        assert result.drifting is False
        assert result.reason is None

    def test_boundary_exactly_15s_no_drift(self):
        """Exactly 15 seconds at low eye contact -> no drift (must be >15s)."""
        detector = AttentionDriftDetector()
        for t in range(0, 15_001, 500):
            result = detector.update(
                role="student",
                eye_contact=0.2,
                energy=0.5,
                timestamp_ms=t,
            )
        assert result.drifting is False


class TestEnergyDropDrift:
    """Drift flag when energy drops > 0.3 from rolling 2-minute average."""

    def test_energy_drop_triggers_drift(self):
        """Energy dropping > 0.3 from 2-min average -> drift activates."""
        detector = AttentionDriftDetector()
        # Build up 2 minutes of high energy
        for t in range(0, 120_000, 2000):
            detector.update(role="tutor", eye_contact=0.8, energy=0.8, timestamp_ms=t)

        # Sudden drop to 0.3 (delta = 0.5, > 0.3 threshold)
        result = detector.update(
            role="tutor", eye_contact=0.8, energy=0.3, timestamp_ms=120_000
        )
        assert result.drifting is True
        assert result.reason == "energy_drop"

    def test_gradual_energy_decline_no_drift(self):
        """Gradual energy decline within 0.3 of rolling average -> no drift."""
        detector = AttentionDriftDetector()
        # Gradually decrease energy from 0.8 to 0.6 over 2 minutes
        for i, t in enumerate(range(0, 120_000, 2000)):
            energy = 0.8 - (i * 0.003)  # Very gradual drop
            detector.update(role="tutor", eye_contact=0.8, energy=energy, timestamp_ms=t)

        # Current energy still within 0.3 of the rolling average
        result = detector.update(
            role="tutor", eye_contact=0.8, energy=0.6, timestamp_ms=120_000
        )
        assert result.drifting is False

    def test_energy_drop_clears_when_energy_recovers(self):
        """Drift clears when energy returns close to rolling average."""
        detector = AttentionDriftDetector()
        # Build baseline
        for t in range(0, 120_000, 2000):
            detector.update(role="tutor", eye_contact=0.8, energy=0.8, timestamp_ms=t)

        # Trigger drift
        detector.update(role="tutor", eye_contact=0.8, energy=0.2, timestamp_ms=120_000)

        # Recover energy
        result = detector.update(
            role="tutor", eye_contact=0.8, energy=0.7, timestamp_ms=122_000
        )
        assert result.drifting is False

    def test_insufficient_history_no_drift(self):
        """With < 2 min of data, no energy-based drift should fire."""
        detector = AttentionDriftDetector()
        # Only 30 seconds of data
        for t in range(0, 30_000, 2000):
            detector.update(role="tutor", eye_contact=0.8, energy=0.8, timestamp_ms=t)

        # Big drop but not enough history
        result = detector.update(
            role="tutor", eye_contact=0.8, energy=0.1, timestamp_ms=30_000
        )
        assert result.drifting is False


class TestIndependentRoles:
    """Drift computed independently for tutor and student."""

    def test_tutor_and_student_independent(self):
        """Tutor drifting does not affect student drift state."""
        detector = AttentionDriftDetector()
        # Tutor has low eye contact for 20s
        for t in range(0, 20_000, 500):
            detector.update(role="tutor", eye_contact=0.1, energy=0.5, timestamp_ms=t)

        tutor_result = detector.update(
            role="tutor", eye_contact=0.1, energy=0.5, timestamp_ms=20_000
        )
        student_result = detector.update(
            role="student", eye_contact=0.9, energy=0.5, timestamp_ms=20_000
        )
        assert tutor_result.drifting is True
        assert student_result.drifting is False


class TestNullMetrics:
    """Handle null eye contact or energy gracefully."""

    def test_null_eye_contact_no_drift(self):
        """Null eye contact (face not detected) should not trigger drift."""
        detector = AttentionDriftDetector()
        for t in range(0, 20_000, 500):
            result = detector.update(
                role="student", eye_contact=None, energy=0.5, timestamp_ms=t
            )
        assert result.drifting is False

    def test_null_energy_no_energy_drift(self):
        """Null energy values should not trigger energy-based drift."""
        detector = AttentionDriftDetector()
        for t in range(0, 120_000, 2000):
            detector.update(role="tutor", eye_contact=0.8, energy=0.8, timestamp_ms=t)
        result = detector.update(
            role="tutor", eye_contact=0.8, energy=None, timestamp_ms=120_000
        )
        assert result.drifting is False


class TestDriftResult:
    """DriftResult has expected attributes."""

    def test_drift_result_has_role(self):
        detector = AttentionDriftDetector()
        result = detector.update(
            role="tutor", eye_contact=0.8, energy=0.5, timestamp_ms=0
        )
        assert result.role == "tutor"
        assert result.drifting is False
        assert result.reason is None
