"""Combined energy score from voice prosody and facial energy."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# Weights per PRD: voice prosody 0.6, facial energy 0.4
VOICE_WEIGHT = 0.6
FACE_WEIGHT = 0.4


class EnergyScorer:
    """Computes a combined energy score (0.0–1.0) per participant.

    Combines voice prosody features (pitch variation, volume variation,
    speech rate) weighted at 0.6 with facial energy weighted at 0.4.
    """

    def compute(
        self,
        prosody: dict[str, float] | None,
        facial_energy: float | None,
    ) -> float:
        """Compute combined energy score.

        Args:
            prosody: Dict with pitch_variation, volume_variation, speech_rate
                     (each 0.0–1.0), or None if audio unavailable.
            facial_energy: Facial energy score (0.0–1.0) from client,
                          or None if face not detected.

        Returns:
            Combined energy score between 0.0 and 1.0.
        """
        voice_score = self._voice_score(prosody)
        face_score = facial_energy if facial_energy is not None else None

        # Handle missing modalities
        if voice_score is not None and face_score is not None:
            return voice_score * VOICE_WEIGHT + face_score * FACE_WEIGHT
        elif voice_score is not None:
            return voice_score
        elif face_score is not None:
            return face_score
        else:
            return 0.0

    @staticmethod
    def _voice_score(prosody: dict[str, float] | None) -> float | None:
        """Compute normalized voice energy from prosody features."""
        if prosody is None:
            return None

        pitch = prosody.get("pitch_variation", 0.0)
        volume = prosody.get("volume_variation", 0.0)
        rate = prosody.get("speech_rate", 0.0)

        # Average of the three normalized features
        score = (pitch + volume + rate) / 3.0
        return max(0.0, min(1.0, score))
