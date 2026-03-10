"""Tests for buffer memory bounds — audio and client metrics buffers."""

from __future__ import annotations

from app.audio.buffer import MAX_CHUNKS_PER_ROLE, AudioChunkBuffer
from app.metrics.buffer import MAX_ENTRIES_PER_ROLE, ClientMetricsBuffer


class TestAudioChunkBufferBounds:
    """Tests for AudioChunkBuffer memory bounds."""

    def test_buffer_evicts_oldest_when_exceeding_max(self):
        buf = AudioChunkBuffer()
        for i in range(MAX_CHUNKS_PER_ROLE + 20):
            buf.add_chunk("s1", "tutor", f"chunk{i}", timestamp=i * 1000)

        chunks = buf.get_chunks("s1", "tutor")
        assert len(chunks) == MAX_CHUNKS_PER_ROLE

    def test_evicted_chunks_are_oldest(self):
        buf = AudioChunkBuffer()
        total = MAX_CHUNKS_PER_ROLE + 10
        for i in range(total):
            buf.add_chunk("s1", "tutor", f"chunk{i}", timestamp=i * 1000)

        chunks = buf.get_chunks("s1", "tutor")
        # The oldest 10 should have been evicted
        assert chunks[0]["data"] == "chunk10"
        assert chunks[-1]["data"] == f"chunk{total - 1}"

    def test_buffer_within_limit_not_evicted(self):
        buf = AudioChunkBuffer()
        for i in range(MAX_CHUNKS_PER_ROLE):
            buf.add_chunk("s1", "tutor", f"chunk{i}", timestamp=i * 1000)

        chunks = buf.get_chunks("s1", "tutor")
        assert len(chunks) == MAX_CHUNKS_PER_ROLE
        assert chunks[0]["data"] == "chunk0"

    def test_eviction_per_role_independent(self):
        buf = AudioChunkBuffer()
        for i in range(MAX_CHUNKS_PER_ROLE + 5):
            buf.add_chunk("s1", "tutor", f"t{i}", timestamp=i * 1000)

        # Student only has 3 chunks — should not be affected
        for i in range(3):
            buf.add_chunk("s1", "student", f"s{i}", timestamp=i * 1000)

        assert len(buf.get_chunks("s1", "tutor")) == MAX_CHUNKS_PER_ROLE
        assert len(buf.get_chunks("s1", "student")) == 3

    def test_eviction_per_session_independent(self):
        buf = AudioChunkBuffer()
        for i in range(MAX_CHUNKS_PER_ROLE + 5):
            buf.add_chunk("s1", "tutor", f"s1-{i}", timestamp=i * 1000)
        for i in range(10):
            buf.add_chunk("s2", "tutor", f"s2-{i}", timestamp=i * 1000)

        assert len(buf.get_chunks("s1", "tutor")) == MAX_CHUNKS_PER_ROLE
        assert len(buf.get_chunks("s2", "tutor")) == 10


class TestClientMetricsBufferBounds:
    """Tests for ClientMetricsBuffer memory bounds."""

    def test_buffer_evicts_oldest_when_exceeding_max(self):
        buf = ClientMetricsBuffer()
        for i in range(MAX_ENTRIES_PER_ROLE + 20):
            buf.add_metrics("s1", "tutor", 0.5, 0.5, timestamp=i * 500)

        history = buf.get_history("s1", "tutor")
        assert len(history) == MAX_ENTRIES_PER_ROLE

    def test_evicted_entries_are_oldest(self):
        buf = ClientMetricsBuffer()
        total = MAX_ENTRIES_PER_ROLE + 10
        for i in range(total):
            buf.add_metrics("s1", "tutor", 0.5, 0.5, timestamp=i * 500)

        history = buf.get_history("s1", "tutor")
        # The oldest 10 should have been evicted
        assert history[0]["timestamp"] == 10 * 500
        assert history[-1]["timestamp"] == (total - 1) * 500

    def test_get_latest_still_works_after_eviction(self):
        buf = ClientMetricsBuffer()
        for i in range(MAX_ENTRIES_PER_ROLE + 5):
            buf.add_metrics("s1", "tutor", float(i) / 1000, 0.5, timestamp=i * 500)

        latest = buf.get_latest("s1", "tutor")
        expected_ts = (MAX_ENTRIES_PER_ROLE + 4) * 500
        assert latest["timestamp"] == expected_ts

    def test_buffer_within_limit_not_evicted(self):
        buf = ClientMetricsBuffer()
        for i in range(MAX_ENTRIES_PER_ROLE):
            buf.add_metrics("s1", "tutor", 0.5, 0.5, timestamp=i * 500)

        history = buf.get_history("s1", "tutor")
        assert len(history) == MAX_ENTRIES_PER_ROLE
        assert history[0]["timestamp"] == 0

    def test_eviction_per_role_independent(self):
        buf = ClientMetricsBuffer()
        for i in range(MAX_ENTRIES_PER_ROLE + 5):
            buf.add_metrics("s1", "tutor", 0.5, 0.5, timestamp=i * 500)

        for i in range(3):
            buf.add_metrics("s1", "student", 0.5, 0.5, timestamp=i * 500)

        assert len(buf.get_history("s1", "tutor")) == MAX_ENTRIES_PER_ROLE
        assert len(buf.get_history("s1", "student")) == 3
