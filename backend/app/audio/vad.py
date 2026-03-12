"""WebRTC VAD-based speech detection for audio chunks."""

from __future__ import annotations

import base64
import logging
from typing import Any

import numpy as np
import webrtcvad

logger = logging.getLogger(__name__)

# WebRTC VAD operates on 10ms, 20ms, or 30ms frames at 8/16/32/48 kHz.
# We use 10ms frames at 16kHz = 160 samples = 320 bytes per frame.
SAMPLE_RATE = 16000
FRAME_DURATION_MS = 10
FRAME_SIZE_BYTES = SAMPLE_RATE * FRAME_DURATION_MS // 1000 * 2  # 320 bytes


# First-order IIR high-pass filter coefficient for ~85Hz cutoff at 16kHz.
# α = RC / (RC + T) where RC = 1/(2π·85), T = 1/16000 ≈ 0.967
_HP_ALPHA = 0.967


def _highpass_filter(pcm_data: bytes) -> bytes:
    """Apply ~85Hz first-order IIR high-pass filter to 16-bit PCM data.

    Removes low-frequency rumble (HVAC, desk vibrations, traffic) that can
    cause false positives in VAD without affecting speech frequencies.
    """
    samples = np.frombuffer(pcm_data, dtype=np.int16).astype(np.float64)
    if len(samples) < 2:
        return pcm_data

    # y[n] = α * (y[n-1] + x[n] - x[n-1])
    filtered = np.empty_like(samples)
    filtered[0] = samples[0]
    for i in range(1, len(samples)):
        filtered[i] = _HP_ALPHA * (filtered[i - 1] + samples[i] - samples[i - 1])

    return np.clip(filtered, -32768, 32767).astype(np.int16).tobytes()


class VadAnalyzer:
    """Classifies audio chunks as speech or non-speech using WebRTC VAD.

    Each call to analyze_chunk processes a base64-encoded PCM audio chunk
    (16kHz, 16-bit signed LE mono) and returns speech detection results.
    """

    def __init__(self, aggressiveness: int = 2) -> None:
        """Initialize VAD with aggressiveness level (0-3, higher = more aggressive filtering)."""
        self._vad = webrtcvad.Vad(aggressiveness)

    def analyze_chunk(self, b64_pcm: str) -> dict[str, Any]:
        """Analyze a base64-encoded PCM audio chunk for speech activity.

        Args:
            b64_pcm: Base64-encoded PCM audio (16kHz, 16-bit signed LE, mono).

        Returns:
            Dict with keys:
                is_speech: Whether the chunk is predominantly speech.
                speech_ratio: Fraction of frames classified as speech (0.0–1.0).
                speech_frames: Number of frames classified as speech.
                total_frames: Total number of frames analyzed.
        """
        try:
            pcm_data = base64.b64decode(b64_pcm)
        except Exception:
            logger.warning("Failed to decode base64 audio data")
            return self._empty_result()

        # Apply high-pass filter to remove low-frequency noise (HVAC, rumble)
        pcm_data = _highpass_filter(pcm_data)

        if len(pcm_data) < FRAME_SIZE_BYTES:
            return self._empty_result()

        total_frames = len(pcm_data) // FRAME_SIZE_BYTES
        speech_frames = 0

        for i in range(total_frames):
            offset = i * FRAME_SIZE_BYTES
            frame = pcm_data[offset : offset + FRAME_SIZE_BYTES]
            try:
                if self._vad.is_speech(frame, SAMPLE_RATE):
                    speech_frames += 1
            except Exception:
                continue

        speech_ratio = speech_frames / total_frames if total_frames > 0 else 0.0
        # Consider chunk as speech if >50% of frames are speech
        is_speech = speech_ratio > 0.5

        return {
            "is_speech": is_speech,
            "speech_ratio": speech_ratio,
            "speech_frames": speech_frames,
            "total_frames": total_frames,
        }

    @staticmethod
    def _empty_result() -> dict[str, Any]:
        """Return a default non-speech result."""
        return {
            "is_speech": False,
            "speech_ratio": 0.0,
            "speech_frames": 0,
            "total_frames": 0,
        }
