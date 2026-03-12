"""Coaching nudge engine — evaluates rules against metrics and manages cooldowns.

Rules fire based on combined tutor + student metrics. Each rule has a
60-second cooldown per nudge type per session. Respects tutor preferences
for enabled nudge types and custom thresholds.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class NudgeResult:
    """A nudge that should be delivered to the tutor."""

    nudge_type: str
    message: str
    priority: str
    trigger_metrics: dict[str, Any]
    timestamp_ms: int


NUDGE_MESSAGES = {
    "student_silent": "Student hasn't spoken — check for understanding",
    "student_low_eye_contact": "Student is looking away — they may be distracted",
    "tutor_dominant": "You've been talking most of the time — try asking a question",
    "student_energy_drop": "Student's energy dropped — consider a break or new approach",
    "interruption_spike": "Frequent interruptions — try giving more wait time",
    "tutor_low_eye_contact": "Your eye contact dropped — try looking at the camera",
}

NUDGE_PRIORITIES = {
    "student_silent": "medium",
    "student_low_eye_contact": "medium",
    "tutor_dominant": "high",
    "student_energy_drop": "medium",
    "interruption_spike": "low",
    "tutor_low_eye_contact": "low",
}

COOLDOWN_MS = 60_000  # 60-second cooldown per nudge type


@dataclass
class _SessionState:
    """Per-session state for tracking rule conditions."""

    # Timestamps when conditions started being met (ms), or None
    student_silent_since: int | None = None
    student_low_eye_since: int | None = None
    tutor_low_eye_since: int | None = None
    tutor_dominant_since: int | None = None

    # Energy baseline tracking (rolling 2-min window)
    student_energy_history: list[tuple[int, float]] = field(default_factory=list)

    # Interruption tracking (count at window start)
    interruption_history: list[tuple[int, int]] = field(default_factory=list)

    # Last fire time per nudge type (for cooldown)
    last_fired: dict[str, int] = field(default_factory=dict)


class NudgeEngine:
    """Evaluates coaching nudge rules against session metrics.

    Maintains per-session state for time-based conditions and cooldowns.
    """

    def __init__(self) -> None:
        self._sessions: dict[str, _SessionState] = defaultdict(_SessionState)

    def evaluate(
        self,
        session_id: str,
        snapshot: dict[str, Any],
        preferences: dict[str, Any],
    ) -> list[NudgeResult]:
        """Evaluate all nudge rules against a metrics snapshot.

        Args:
            session_id: Session identifier.
            snapshot: Metrics snapshot dict from MetricsAggregator.
            preferences: Tutor preferences with enabled_nudges and nudge_thresholds.

        Returns:
            List of NudgeResult for nudges that should fire.
        """
        state = self._sessions[session_id]
        enabled = set(preferences.get("enabled_nudges", []))
        thresholds = preferences.get("nudge_thresholds", {})
        ts = snapshot["timestamp_ms"]

        results: list[NudgeResult] = []

        # Evaluate each rule
        for nudge_type, check_fn in self._rules():
            if nudge_type not in enabled:
                continue
            if self._on_cooldown(state, nudge_type, ts):
                continue

            triggered = check_fn(state, snapshot, thresholds, ts)
            if triggered:
                trigger_metrics = self._extract_trigger_metrics(nudge_type, snapshot)
                result = NudgeResult(
                    nudge_type=nudge_type,
                    message=NUDGE_MESSAGES[nudge_type],
                    priority=NUDGE_PRIORITIES[nudge_type],
                    trigger_metrics=trigger_metrics,
                    timestamp_ms=ts,
                )
                results.append(result)
                state.last_fired[nudge_type] = ts

        return results

    def clear_session(self, session_id: str) -> None:
        """Clean up state for a completed session."""
        self._sessions.pop(session_id, None)

    def _rules(self):
        """Return all rule check functions keyed by nudge type."""
        return [
            ("student_silent", self._check_student_silent),
            ("student_low_eye_contact", self._check_student_low_eye),
            ("tutor_dominant", self._check_tutor_dominant),
            ("student_energy_drop", self._check_student_energy_drop),
            ("interruption_spike", self._check_interruption_spike),
            ("tutor_low_eye_contact", self._check_tutor_low_eye),
        ]

    @staticmethod
    def _on_cooldown(state: _SessionState, nudge_type: str, ts: int) -> bool:
        last = state.last_fired.get(nudge_type)
        if last is None:
            return False
        return (ts - last) < COOLDOWN_MS

    @staticmethod
    def _check_student_silent(
        state: _SessionState,
        snapshot: dict[str, Any],
        thresholds: dict[str, Any],
        ts: int,
    ) -> bool:
        threshold_minutes = thresholds.get("student_silent_minutes", 3)
        threshold_ms = threshold_minutes * 60 * 1000
        student_talk = snapshot.get("student_talk_pct")
        if student_talk is None:
            student_talk = 0

        if student_talk < 1.0:  # Effectively silent
            if state.student_silent_since is None:
                state.student_silent_since = ts
            elif (ts - state.student_silent_since) >= threshold_ms:
                state.student_silent_since = ts  # Reset for next window
                return True
        else:
            state.student_silent_since = None
        return False

    @staticmethod
    def _check_student_low_eye(
        state: _SessionState,
        snapshot: dict[str, Any],
        thresholds: dict[str, Any],
        ts: int,
    ) -> bool:
        threshold_val = thresholds.get("eye_contact_low", 0.3)
        duration_s = thresholds.get("eye_contact_duration_s", 30)
        duration_ms = duration_s * 1000
        eye = snapshot.get("student_eye_contact")

        if eye is not None and eye < threshold_val:
            if state.student_low_eye_since is None:
                state.student_low_eye_since = ts
            elif (ts - state.student_low_eye_since) >= duration_ms:
                state.student_low_eye_since = ts  # Reset for next window
                return True
        else:
            state.student_low_eye_since = None
        return False

    @staticmethod
    def _check_tutor_low_eye(
        state: _SessionState,
        snapshot: dict[str, Any],
        thresholds: dict[str, Any],
        ts: int,
    ) -> bool:
        threshold_val = thresholds.get("eye_contact_low", 0.3)
        duration_s = thresholds.get("eye_contact_duration_s", 30)
        duration_ms = duration_s * 1000
        eye = snapshot.get("tutor_eye_contact")

        if eye is not None and eye < threshold_val:
            if state.tutor_low_eye_since is None:
                state.tutor_low_eye_since = ts
            elif (ts - state.tutor_low_eye_since) >= duration_ms:
                state.tutor_low_eye_since = ts
                return True
        else:
            state.tutor_low_eye_since = None
        return False

    @staticmethod
    def _check_tutor_dominant(
        state: _SessionState,
        snapshot: dict[str, Any],
        thresholds: dict[str, Any],
        ts: int,
    ) -> bool:
        talk_threshold = thresholds.get("tutor_talk_pct", 0.8) * 100  # Convert to percentage
        duration_minutes = thresholds.get("tutor_talk_duration_minutes", 5)
        duration_ms = duration_minutes * 60 * 1000
        tutor_talk = snapshot.get("tutor_talk_pct")
        if tutor_talk is None:
            tutor_talk = 0

        if tutor_talk > talk_threshold:
            if state.tutor_dominant_since is None:
                state.tutor_dominant_since = ts
            elif (ts - state.tutor_dominant_since) >= duration_ms:
                state.tutor_dominant_since = ts
                return True
        else:
            state.tutor_dominant_since = None
        return False

    @staticmethod
    def _check_student_energy_drop(
        state: _SessionState,
        snapshot: dict[str, Any],
        thresholds: dict[str, Any],
        ts: int,
    ) -> bool:
        drop_threshold = thresholds.get("energy_drop_pct", 0.3)
        student_energy = snapshot.get("student_energy")

        if student_energy is None:
            return False

        # Maintain 2-minute energy history
        window_ms = 120_000
        state.student_energy_history.append((ts, student_energy))
        # Prune old entries
        state.student_energy_history = [
            (t, e) for t, e in state.student_energy_history if ts - t <= window_ms
        ]

        if len(state.student_energy_history) < 10:
            return False

        # Compute rolling average (excluding the most recent 5 samples)
        old_entries = state.student_energy_history[:-5]
        if not old_entries:
            return False
        avg_energy = sum(e for _, e in old_entries) / len(old_entries)

        # Check if current energy dropped by more than threshold from average
        drop = avg_energy - student_energy
        return drop > drop_threshold

    @staticmethod
    def _check_interruption_spike(
        state: _SessionState,
        snapshot: dict[str, Any],
        thresholds: dict[str, Any],
        ts: int,
    ) -> bool:
        count_threshold = thresholds.get("interruption_count", 3)
        window_minutes = thresholds.get("interruption_window_minutes", 2)
        window_ms = window_minutes * 60 * 1000
        current_count = snapshot.get("interruption_count") or 0

        # Track count over time to detect new interruptions in window
        state.interruption_history.append((ts, current_count))
        # Prune old entries
        state.interruption_history = [
            (t, c) for t, c in state.interruption_history if ts - t <= window_ms
        ]

        if len(state.interruption_history) < 2:
            return False

        # Interruptions in window = current count - count at window start
        oldest_count = state.interruption_history[0][1]
        new_interruptions = current_count - oldest_count

        return new_interruptions >= count_threshold

    @staticmethod
    def _extract_trigger_metrics(
        nudge_type: str, snapshot: dict[str, Any]
    ) -> dict[str, Any]:
        """Extract relevant trigger metrics for persistence."""
        if nudge_type == "student_silent":
            return {"student_talk_pct": snapshot.get("student_talk_pct")}
        if nudge_type in ("student_low_eye_contact", "tutor_low_eye_contact"):
            key = "student_eye_contact" if "student" in nudge_type else "tutor_eye_contact"
            return {key: snapshot.get(key)}
        if nudge_type == "tutor_dominant":
            return {"tutor_talk_pct": snapshot.get("tutor_talk_pct")}
        if nudge_type == "student_energy_drop":
            return {"student_energy": snapshot.get("student_energy")}
        if nudge_type == "interruption_spike":
            return {"interruption_count": snapshot.get("interruption_count")}
        return {}
