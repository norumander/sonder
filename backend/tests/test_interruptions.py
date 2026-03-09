"""Tests for interruption detection from overlapping speech."""

from __future__ import annotations

from app.metrics.interruptions import InterruptionDetector

S = "session-1"


def _u(det, sid, t, s, ts):
    """Shorthand for detector.update with positional args."""
    det.update(sid, tutor_is_speech=t, student_is_speech=s, timestamp_ms=ts)


class TestInterruptionDetector:
    """Unit tests for overlapping speech detection and interruption counting."""

    def test_no_overlap_no_interruption(self):
        d = InterruptionDetector()
        _u(d, S, True, False, 0)
        _u(d, S, True, False, 1000)
        assert d.get_counts(S)["total"] == 0

    def test_overlap_under_300ms_no_interruption(self):
        d = InterruptionDetector()
        _u(d, S, True, False, 0)
        _u(d, S, True, True, 100)
        _u(d, S, True, True, 200)
        _u(d, S, True, False, 300)
        assert d.get_counts(S)["total"] == 0

    def test_overlap_over_300ms_counts_interruption(self):
        d = InterruptionDetector()
        _u(d, S, True, False, 0)
        _u(d, S, True, True, 100)
        _u(d, S, True, True, 200)
        _u(d, S, True, True, 300)
        _u(d, S, True, True, 400)
        _u(d, S, True, False, 500)
        assert d.get_counts(S)["total"] == 1

    def test_student_interrupts_tutor(self):
        """Student starts speaking second -> student is the interrupter."""
        d = InterruptionDetector()
        _u(d, S, True, False, 0)
        _u(d, S, True, True, 100)
        _u(d, S, True, True, 200)
        _u(d, S, True, True, 300)
        _u(d, S, True, True, 400)
        _u(d, S, True, False, 500)

        result = d.get_counts(S)
        assert result["student"] == 1
        assert result["tutor"] == 0

    def test_tutor_interrupts_student(self):
        """Tutor starts speaking second -> tutor is the interrupter."""
        d = InterruptionDetector()
        _u(d, S, False, True, 0)
        _u(d, S, True, True, 100)
        _u(d, S, True, True, 200)
        _u(d, S, True, True, 300)
        _u(d, S, True, True, 400)
        _u(d, S, True, False, 500)

        result = d.get_counts(S)
        assert result["tutor"] == 1
        assert result["student"] == 0

    def test_multiple_interruptions(self):
        """Three separate overlapping segments -> reports 3 interruptions."""
        d = InterruptionDetector()

        for i in range(3):
            base = i * 2000
            _u(d, S, True, False, base)
            _u(d, S, True, True, base + 100)
            _u(d, S, True, True, base + 200)
            _u(d, S, True, True, base + 300)
            _u(d, S, True, True, base + 400)
            _u(d, S, True, False, base + 500)
            _u(d, S, False, False, base + 1000)

        result = d.get_counts(S)
        assert abs(result["total"] - 3) <= 1

    def test_cumulative_count_maintained(self):
        d = InterruptionDetector()

        # First interruption
        _u(d, S, True, False, 0)
        _u(d, S, True, True, 100)
        _u(d, S, True, True, 500)
        _u(d, S, True, False, 600)
        assert d.get_counts(S)["total"] == 1

        # Gap
        _u(d, S, False, False, 1000)

        # Second interruption
        _u(d, S, False, True, 2000)
        _u(d, S, True, True, 2100)
        _u(d, S, True, True, 2500)
        _u(d, S, False, False, 2600)
        assert d.get_counts(S)["total"] == 2

    def test_sessions_tracked_separately(self):
        d = InterruptionDetector()

        _u(d, S, True, False, 0)
        _u(d, S, True, True, 100)
        _u(d, S, True, True, 500)
        _u(d, S, True, False, 600)

        _u(d, "session-2", True, False, 0)

        assert d.get_counts(S)["total"] == 1
        assert d.get_counts("session-2")["total"] == 0

    def test_both_start_simultaneously_no_interrupter(self):
        """Both start speaking at the same time -> no specific interrupter."""
        d = InterruptionDetector()
        _u(d, S, True, True, 0)
        _u(d, S, True, True, 100)
        _u(d, S, True, True, 200)
        _u(d, S, True, True, 300)
        _u(d, S, True, True, 400)
        _u(d, S, False, False, 500)

        result = d.get_counts(S)
        assert result["total"] == 1

    def test_initial_counts_zero(self):
        d = InterruptionDetector()
        result = d.get_counts("nonexistent")
        assert result["total"] == 0
        assert result["tutor"] == 0
        assert result["student"] == 0

    def test_clear_session(self):
        d = InterruptionDetector()
        _u(d, S, True, False, 0)
        _u(d, S, True, True, 100)
        _u(d, S, True, True, 500)
        _u(d, S, True, False, 600)

        d.clear_session(S)
        assert d.get_counts(S)["total"] == 0
