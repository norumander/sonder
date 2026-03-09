"""Tests for server metrics aggregator (TASK-014)."""

from __future__ import annotations

from app.metrics.aggregator import MetricsAggregator


class TestMetricsAggregatorSnapshot:
    """Test that aggregator produces correct server_metrics snapshots."""

    def test_snapshot_contains_all_fields(self):
        """Snapshot includes tutor/student talk_pct, interruptions, energy, drift."""
        agg = MetricsAggregator()
        sid = "sess-1"

        # Feed some client metrics
        agg.update_client_metrics(
            sid, "tutor", eye_contact=0.9, facial_energy=0.7, timestamp_ms=0
        )
        agg.update_client_metrics(
            sid, "student", eye_contact=0.8, facial_energy=0.6, timestamp_ms=0
        )

        snapshot = agg.get_snapshot(sid, timestamp_ms=0)

        assert "tutor_talk_pct" in snapshot
        assert "student_talk_pct" in snapshot
        assert "interruption_count" in snapshot
        assert "tutor_energy" in snapshot
        assert "student_energy" in snapshot
        assert "tutor_eye_contact" in snapshot
        assert "student_eye_contact" in snapshot
        assert "tutor_attention_drift" in snapshot
        assert "student_attention_drift" in snapshot

    def test_snapshot_includes_eye_contact_from_client(self):
        """Eye contact scores come from latest client metrics."""
        agg = MetricsAggregator()
        sid = "sess-2"

        agg.update_client_metrics(
            sid, "tutor", eye_contact=0.85, facial_energy=0.5, timestamp_ms=1000
        )
        snapshot = agg.get_snapshot(sid, timestamp_ms=1000)

        assert snapshot["tutor_eye_contact"] == 0.85

    def test_snapshot_null_when_no_data(self):
        """Missing participant data produces null values."""
        agg = MetricsAggregator()
        snapshot = agg.get_snapshot("no-data-session", timestamp_ms=0)

        assert snapshot["tutor_talk_pct"] is None
        assert snapshot["student_talk_pct"] is None
        assert snapshot["tutor_eye_contact"] is None
        assert snapshot["student_eye_contact"] is None
        assert snapshot["tutor_energy"] is None
        assert snapshot["student_energy"] is None


class TestMetricsAggregatorAudioProcessing:
    """Test audio chunk processing through the aggregator."""

    def test_audio_chunk_updates_talk_time(self):
        """Processing audio chunks updates talk time percentages."""
        agg = MetricsAggregator()
        sid = "sess-audio"

        import base64
        silence = base64.b64encode(b"\x00" * 32000).decode()

        agg.process_audio_chunk(sid, "tutor", silence, timestamp_ms=0)

        snapshot = agg.get_snapshot(sid, timestamp_ms=1000)
        assert snapshot["tutor_talk_pct"] is not None


class TestMetricsAggregatorDrift:
    """Test attention drift integration in aggregator."""

    def test_drift_activates_after_sustained_low_eye_contact(self):
        """Attention drift flag appears after >15s low eye contact."""
        agg = MetricsAggregator()
        sid = "sess-drift"

        for t in range(0, 20_000, 500):
            agg.update_client_metrics(
                sid, "student", eye_contact=0.1,
                facial_energy=0.5, timestamp_ms=t,
            )

        snapshot = agg.get_snapshot(sid, timestamp_ms=20_000)
        assert snapshot["student_attention_drift"] is True

    def test_no_drift_with_good_eye_contact(self):
        """No drift when eye contact is fine."""
        agg = MetricsAggregator()
        sid = "sess-nodrift"

        for t in range(0, 20_000, 500):
            agg.update_client_metrics(
                sid, "student", eye_contact=0.9,
                facial_energy=0.5, timestamp_ms=t,
            )

        snapshot = agg.get_snapshot(sid, timestamp_ms=20_000)
        assert snapshot["student_attention_drift"] is False

    def test_drift_reason_in_snapshot(self):
        """Drift reason is included in the snapshot."""
        agg = MetricsAggregator()
        sid = "sess-reason"

        for t in range(0, 20_000, 500):
            agg.update_client_metrics(
                sid, "student", eye_contact=0.1,
                facial_energy=0.5, timestamp_ms=t,
            )

        snapshot = agg.get_snapshot(sid, timestamp_ms=20_000)
        assert snapshot.get("drift_reason") == "low_eye_contact"


class TestMetricsAggregatorInterruptions:
    """Test interruption count integration."""

    def test_interruptions_in_snapshot(self):
        """Interruption count from detector appears in snapshot."""
        agg = MetricsAggregator()
        sid = "sess-int"

        snapshot = agg.get_snapshot(sid, timestamp_ms=0)
        assert snapshot["interruption_count"] == 0


class TestMetricsAggregatorDriftChanged:
    """Test drift change detection for broadcasting."""

    def test_drift_change_detected(self):
        """Aggregator detects when drift state changes."""
        agg = MetricsAggregator()
        sid = "sess-dc"

        agg.update_client_metrics(
            sid, "student", eye_contact=0.9,
            facial_energy=0.5, timestamp_ms=0,
        )
        assert agg.get_drift_changes(sid) == []

        for t in range(500, 20_000, 500):
            agg.update_client_metrics(
                sid, "student", eye_contact=0.1,
                facial_energy=0.5, timestamp_ms=t,
            )

        changes = agg.get_drift_changes(sid)
        assert len(changes) == 1
        assert changes[0]["role"] == "student"
        assert changes[0]["drifting"] is True

    def test_no_change_when_state_stable(self):
        """No drift change emitted when state hasn't changed."""
        agg = MetricsAggregator()
        sid = "sess-stable"

        agg.update_client_metrics(
            sid, "tutor", eye_contact=0.9,
            facial_energy=0.5, timestamp_ms=0,
        )
        _ = agg.get_drift_changes(sid)

        agg.update_client_metrics(
            sid, "tutor", eye_contact=0.9,
            facial_energy=0.5, timestamp_ms=500,
        )
        changes = agg.get_drift_changes(sid)
        assert changes == []
