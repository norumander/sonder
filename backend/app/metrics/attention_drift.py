"""Attention drift detection per participant.

Flags drift when:
- Eye contact < 0.3 for > 15 consecutive seconds
- Energy drops > 0.3 from rolling 2-minute average
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Thresholds per PRD
EYE_CONTACT_THRESHOLD = 0.3
EYE_CONTACT_DURATION_MS = 15_000  # > 15 seconds
ENERGY_DROP_THRESHOLD = 0.3
ENERGY_WINDOW_MS = 120_000  # 2-minute rolling window


@dataclass
class DriftResult:
    """Result of a drift evaluation for one participant."""

    role: str
    drifting: bool
    reason: str | None


class _ParticipantState:
    """Tracks drift state for a single participant."""

    def __init__(self) -> None:
        # Eye contact tracking
        self.low_eye_contact_start_ms: int | None = None

        # Energy tracking: list of (timestamp_ms, energy) tuples
        self.energy_history: list[tuple[int, float]] = []

    def update(
        self,
        role: str,
        eye_contact: float | None,
        energy: float | None,
        timestamp_ms: int,
    ) -> DriftResult:
        """Evaluate drift conditions and return result."""
        eye_drift = self._check_eye_contact(eye_contact, timestamp_ms)
        energy_drift = self._check_energy_drop(energy, timestamp_ms)

        if eye_drift:
            return DriftResult(role=role, drifting=True, reason="low_eye_contact")
        if energy_drift:
            return DriftResult(role=role, drifting=True, reason="energy_drop")

        return DriftResult(role=role, drifting=False, reason=None)

    def _check_eye_contact(
        self, eye_contact: float | None, timestamp_ms: int
    ) -> bool:
        """Check if eye contact has been below threshold for > 15 seconds."""
        if eye_contact is None or eye_contact >= EYE_CONTACT_THRESHOLD:
            self.low_eye_contact_start_ms = None
            return False

        # Eye contact is below threshold
        if self.low_eye_contact_start_ms is None:
            self.low_eye_contact_start_ms = timestamp_ms

        duration = timestamp_ms - self.low_eye_contact_start_ms
        return duration > EYE_CONTACT_DURATION_MS

    def _check_energy_drop(
        self, energy: float | None, timestamp_ms: int
    ) -> bool:
        """Check if energy has dropped > 0.3 from 2-minute rolling average."""
        if energy is None:
            return False

        # Add to history
        self.energy_history.append((timestamp_ms, energy))

        # Prune entries older than the window
        cutoff = timestamp_ms - ENERGY_WINDOW_MS
        self.energy_history = [
            (t, e) for t, e in self.energy_history if t >= cutoff
        ]

        # Need at least 2 minutes of data to compute meaningful average
        if not self.energy_history:
            return False

        oldest_ts = self.energy_history[0][0]
        span = timestamp_ms - oldest_ts
        if span < ENERGY_WINDOW_MS:
            return False

        # Compute rolling average excluding the current value
        history_without_current = self.energy_history[:-1]
        if not history_without_current:
            return False

        avg = sum(e for _, e in history_without_current) / len(
            history_without_current
        )
        drop = avg - energy
        return drop > ENERGY_DROP_THRESHOLD


class AttentionDriftDetector:
    """Detects attention drift independently per session and participant.

    Tracks per-session, per-participant state and evaluates two drift conditions:
    1. Eye contact below 0.3 for more than 15 consecutive seconds
    2. Energy drop greater than 0.3 from 2-minute rolling average
    """

    def __init__(self) -> None:
        # Keyed by (session_id, role) to isolate sessions
        self._states: dict[tuple[str, str], _ParticipantState] = defaultdict(
            _ParticipantState
        )

    def update(
        self,
        session_id: str,
        role: str,
        eye_contact: float | None,
        energy: float | None,
        timestamp_ms: int,
    ) -> DriftResult:
        """Update drift detection for a participant in a session.

        Args:
            session_id: Session identifier.
            role: "tutor" or "student".
            eye_contact: Eye contact score (0.0–1.0) or None if unavailable.
            energy: Combined energy score (0.0–1.0) or None if unavailable.
            timestamp_ms: Timestamp in ms relative to session start.

        Returns:
            DriftResult with current drift state and reason.
        """
        return self._states[(session_id, role)].update(role, eye_contact, energy, timestamp_ms)

    def clear_session(self, session_id: str) -> None:
        """Reset drift state for all participants in a session."""
        keys_to_remove = [k for k in self._states if k[0] == session_id]
        for key in keys_to_remove:
            del self._states[key]
