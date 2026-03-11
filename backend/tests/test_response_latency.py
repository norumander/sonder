"""Tests for ResponseLatencyTracker — measures speaker transition gaps."""

import pytest

from app.metrics.response_latency import ResponseLatencyTracker


@pytest.fixture
def tracker():
    return ResponseLatencyTracker()


class TestResponseLatencyBasics:
    """Core response latency tracking behavior."""

    def test_no_data_returns_none(self, tracker):
        assert tracker.get_avg_latency_ms("s1") is None

    def test_no_samples_returns_zero_count(self, tracker):
        assert tracker.get_sample_count("s1") == 0

    def test_single_transition_records_latency(self, tracker):
        # Tutor speaks then stops
        tracker.update("s1", "tutor", True, 1000)
        tracker.update("s1", "tutor", False, 3000)

        # Student responds 500ms later
        tracker.update("s1", "student", True, 3500)

        assert tracker.get_avg_latency_ms("s1") == 500
        assert tracker.get_sample_count("s1") == 1

    def test_multiple_transitions_averages(self, tracker):
        # Turn 1: tutor speaks, stops at 3000, student responds at 3500 (gap=500ms)
        tracker.update("s1", "tutor", True, 1000)
        tracker.update("s1", "tutor", False, 3000)
        tracker.update("s1", "student", True, 3500)

        # Turn 2: student stops at 5000, tutor responds at 6500 (gap=1500ms)
        tracker.update("s1", "student", False, 5000)
        tracker.update("s1", "tutor", True, 6500)

        avg = tracker.get_avg_latency_ms("s1")
        assert avg == 1000  # (500 + 1500) / 2
        assert tracker.get_sample_count("s1") == 2

    def test_overlap_not_counted(self, tracker):
        """Overlapping speech (gap < MIN_GAP_MS) should not count as response latency."""
        tracker.update("s1", "tutor", True, 1000)
        tracker.update("s1", "tutor", False, 3000)
        # Student responds too quickly (50ms — likely overlap)
        tracker.update("s1", "student", True, 3050)

        assert tracker.get_avg_latency_ms("s1") is None

    def test_long_pause_not_counted(self, tracker):
        """Very long gaps (> MAX_GAP_MS) should not count as response latency."""
        tracker.update("s1", "tutor", True, 1000)
        tracker.update("s1", "tutor", False, 3000)
        # Student responds 20 seconds later — this is a pause, not a response
        tracker.update("s1", "student", True, 23000)

        assert tracker.get_avg_latency_ms("s1") is None


class TestResponseLatencyEdgeCases:
    """Edge cases and cleanup."""

    def test_clear_session_removes_state(self, tracker):
        tracker.update("s1", "tutor", True, 1000)
        tracker.update("s1", "tutor", False, 3000)
        tracker.update("s1", "student", True, 3500)

        assert tracker.get_sample_count("s1") == 1
        tracker.clear_session("s1")
        assert tracker.get_avg_latency_ms("s1") is None
        assert tracker.get_sample_count("s1") == 0

    def test_sessions_are_isolated(self, tracker):
        tracker.update("s1", "tutor", True, 1000)
        tracker.update("s1", "tutor", False, 3000)
        tracker.update("s1", "student", True, 3500)

        tracker.update("s2", "tutor", True, 1000)
        tracker.update("s2", "tutor", False, 3000)
        tracker.update("s2", "student", True, 4000)

        assert tracker.get_avg_latency_ms("s1") == 500
        assert tracker.get_avg_latency_ms("s2") == 1000

    def test_same_role_speaking_again_no_latency(self, tracker):
        """If the same person stops and starts again, it's not a response."""
        tracker.update("s1", "tutor", True, 1000)
        tracker.update("s1", "tutor", False, 3000)
        # Tutor starts again (not student)
        tracker.update("s1", "tutor", True, 3500)

        assert tracker.get_avg_latency_ms("s1") is None

    def test_boundary_gap_min(self, tracker):
        """Exactly MIN_GAP_MS should be counted."""
        tracker.update("s1", "tutor", True, 1000)
        tracker.update("s1", "tutor", False, 3000)
        tracker.update("s1", "student", True, 3100)  # gap = 100ms = MIN_GAP_MS

        assert tracker.get_avg_latency_ms("s1") == 100

    def test_boundary_gap_max(self, tracker):
        """Exactly MAX_GAP_MS should be counted."""
        tracker.update("s1", "tutor", True, 1000)
        tracker.update("s1", "tutor", False, 3000)
        tracker.update("s1", "student", True, 18000)  # gap = 15000ms = MAX_GAP_MS

        assert tracker.get_avg_latency_ms("s1") == 15000
