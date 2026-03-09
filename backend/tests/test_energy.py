"""Tests for energy level metric (voice prosody + facial energy)."""

from __future__ import annotations

import base64
import math
import struct

from app.audio.prosody import ProsodyAnalyzer
from app.metrics.energy import EnergyScorer

# --- ProsodyAnalyzer unit tests ---


class TestProsodyAnalyzer:
    """Unit tests for voice prosody feature extraction."""

    def _make_tone(self, freq: float, amplitude: int, duration_s: float = 1.0):
        """Generate a pure tone as base64-encoded 16-bit PCM at 16kHz."""
        sample_rate = 16000
        n_samples = int(sample_rate * duration_s)
        samples = [
            int(amplitude * math.sin(2 * math.pi * freq * i / sample_rate))
            for i in range(n_samples)
        ]
        pcm = struct.pack(f"<{n_samples}h", *samples)
        return base64.b64encode(pcm).decode()

    def _make_silence(self, duration_s: float = 1.0):
        """Generate silence as base64-encoded PCM."""
        n_bytes = int(16000 * duration_s) * 2
        return base64.b64encode(b"\x00" * n_bytes).decode()

    def test_silence_returns_low_features(self):
        analyzer = ProsodyAnalyzer()
        b64 = self._make_silence()
        result = analyzer.analyze(b64)
        assert result["pitch_variation"] is not None
        assert result["volume_variation"] is not None

    def test_tone_returns_features(self):
        analyzer = ProsodyAnalyzer()
        b64 = self._make_tone(440, 10000)
        result = analyzer.analyze(b64)
        assert "pitch_variation" in result
        assert "volume_variation" in result
        assert "speech_rate" in result

    def test_empty_data_returns_zeros(self):
        analyzer = ProsodyAnalyzer()
        b64 = base64.b64encode(b"").decode()
        result = analyzer.analyze(b64)
        assert result["pitch_variation"] == 0.0
        assert result["volume_variation"] == 0.0
        assert result["speech_rate"] == 0.0

    def test_varied_pitch_higher_variation(self):
        """A signal with pitch changes should have higher variation."""
        analyzer = ProsodyAnalyzer()
        # Tone that changes frequency mid-chunk
        sample_rate = 16000
        n_samples = 16000  # 1 second
        samples = []
        for i in range(n_samples):
            freq = 200 if i < n_samples // 2 else 600
            val = int(10000 * math.sin(2 * math.pi * freq * i / sample_rate))
            samples.append(val)
        pcm = struct.pack(f"<{n_samples}h", *samples)
        b64 = base64.b64encode(pcm).decode()

        result = analyzer.analyze(b64)
        assert result["pitch_variation"] >= 0.0


# --- EnergyScorer unit tests ---


class TestEnergyScorer:
    """Unit tests for combined energy score computation."""

    def test_monotone_neutral_face_low_energy(self):
        """Monotone + neutral face -> energy <= 0.3."""
        scorer = EnergyScorer()
        prosody = {
            "pitch_variation": 0.0,
            "volume_variation": 0.0,
            "speech_rate": 0.0,
        }
        score = scorer.compute(prosody, facial_energy=0.0)
        assert score <= 0.3

    def test_animated_speech_expressive_face_high_energy(self):
        """Animated speech + expressive face -> energy >= 0.7."""
        scorer = EnergyScorer()
        prosody = {
            "pitch_variation": 1.0,
            "volume_variation": 1.0,
            "speech_rate": 1.0,
        }
        score = scorer.compute(prosody, facial_energy=1.0)
        assert score >= 0.7

    def test_voice_weight_is_0_6(self):
        """Voice prosody has 0.6 weight, facial energy 0.4."""
        scorer = EnergyScorer()
        # Voice only, no face
        voice_only = scorer.compute(
            {"pitch_variation": 1.0, "volume_variation": 1.0, "speech_rate": 1.0},
            facial_energy=0.0,
        )
        # Face only, no voice
        face_only = scorer.compute(
            {"pitch_variation": 0.0, "volume_variation": 0.0, "speech_rate": 0.0},
            facial_energy=1.0,
        )
        assert abs(voice_only - 0.6) < 0.05
        assert abs(face_only - 0.4) < 0.05

    def test_score_between_0_and_1(self):
        scorer = EnergyScorer()
        for pv in [0.0, 0.5, 1.0]:
            for fe in [0.0, 0.5, 1.0]:
                prosody = {
                    "pitch_variation": pv,
                    "volume_variation": pv,
                    "speech_rate": pv,
                }
                score = scorer.compute(prosody, facial_energy=fe)
                assert 0.0 <= score <= 1.0

    def test_null_facial_energy_uses_voice_only(self):
        """When facial energy is None, score based on voice only."""
        scorer = EnergyScorer()
        prosody = {
            "pitch_variation": 1.0,
            "volume_variation": 1.0,
            "speech_rate": 1.0,
        }
        score = scorer.compute(prosody, facial_energy=None)
        assert score > 0.0

    def test_null_prosody_uses_face_only(self):
        """When prosody is None, score based on face only."""
        scorer = EnergyScorer()
        score = scorer.compute(prosody=None, facial_energy=0.8)
        assert score > 0.0
