"""Voice prosody feature extraction using librosa."""

from __future__ import annotations

import base64
import logging

import librosa
import numpy as np

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16000


class ProsodyAnalyzer:
    """Extracts prosody features (pitch variation, volume variation, speech rate)
    from base64-encoded PCM audio chunks.

    Features are normalized to 0.0–1.0 range for use in energy scoring.
    """

    def analyze(self, b64_pcm: str) -> dict[str, float]:
        """Extract prosody features from a base64-encoded PCM audio chunk.

        Args:
            b64_pcm: Base64-encoded PCM audio (16kHz, 16-bit signed LE, mono).

        Returns:
            Dict with normalized features:
                pitch_variation: Normalized pitch standard deviation (0.0–1.0).
                volume_variation: Normalized RMS volume variation (0.0–1.0).
                speech_rate: Estimated speech rate proxy (0.0–1.0).
        """
        try:
            pcm_data = base64.b64decode(b64_pcm)
        except Exception:
            return self._empty_result()

        if len(pcm_data) < 640:  # Less than 20ms at 16kHz
            return self._empty_result()

        # Convert 16-bit LE PCM to float32 array
        audio = np.frombuffer(pcm_data, dtype=np.int16).astype(np.float32)
        audio = audio / 32768.0  # Normalize to [-1.0, 1.0]

        pitch_var = self._compute_pitch_variation(audio)
        volume_var = self._compute_volume_variation(audio)
        speech_rate = self._compute_speech_rate(audio)

        return {
            "pitch_variation": pitch_var,
            "volume_variation": volume_var,
            "speech_rate": speech_rate,
        }

    def _compute_pitch_variation(self, audio: np.ndarray) -> float:
        """Compute normalized pitch variation using librosa's pyin."""
        try:
            f0, voiced_flag, _ = librosa.pyin(
                audio,
                fmin=librosa.note_to_hz("C2"),
                fmax=librosa.note_to_hz("C7"),
                sr=SAMPLE_RATE,
            )
            voiced_f0 = f0[voiced_flag]
            if len(voiced_f0) < 2:
                return 0.0
            # Normalize: std dev of Hz, capped at ~200Hz variation
            std = float(np.std(voiced_f0))
            return min(std / 200.0, 1.0)
        except Exception:
            return 0.0

    def _compute_volume_variation(self, audio: np.ndarray) -> float:
        """Compute normalized RMS volume variation across frames."""
        try:
            rms = librosa.feature.rms(y=audio, frame_length=512, hop_length=256)[0]
            if len(rms) < 2:
                return 0.0
            # Normalize: coefficient of variation, capped at 2.0
            mean_rms = float(np.mean(rms))
            if mean_rms < 1e-6:
                return 0.0
            cv = float(np.std(rms)) / mean_rms
            return min(cv / 2.0, 1.0)
        except Exception:
            return 0.0

    def _compute_speech_rate(self, audio: np.ndarray) -> float:
        """Estimate speech rate proxy from spectral flux (onset density)."""
        try:
            onset_env = librosa.onset.onset_strength(
                y=audio, sr=SAMPLE_RATE
            )
            onsets = librosa.onset.onset_detect(
                onset_envelope=onset_env, sr=SAMPLE_RATE
            )
            duration_s = len(audio) / SAMPLE_RATE
            if duration_s < 0.1:
                return 0.0
            # Normalize: onsets per second, cap at ~8 onsets/sec
            rate = len(onsets) / duration_s
            return min(rate / 8.0, 1.0)
        except Exception:
            return 0.0

    @staticmethod
    def _empty_result() -> dict[str, float]:
        """Return default zero features."""
        return {
            "pitch_variation": 0.0,
            "volume_variation": 0.0,
            "speech_rate": 0.0,
        }
