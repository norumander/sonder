"""Server metrics aggregator — combines all metric sources into unified snapshots.

Wires together: client metrics buffer, VAD, talk time, interruptions,
prosody, energy scoring, attention drift detection, and response latency.
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from typing import Any

from app.audio.prosody import ProsodyAnalyzer
from app.audio.vad import VadAnalyzer
from app.metrics.attention_drift import AttentionDriftDetector
from app.metrics.energy import EnergyScorer
from app.metrics.interruptions import InterruptionDetector
from app.metrics.response_latency import ResponseLatencyTracker
from app.metrics.talk_time import TalkTimeTracker

logger = logging.getLogger(__name__)


class MetricsAggregator:
    """Aggregates all server-side metrics for a session.

    Combines client-side metrics (eye contact, facial energy) with
    server-computed metrics (talk time, interruptions, energy, attention drift)
    into unified snapshots for broadcasting to the tutor.
    """

    def __init__(self) -> None:
        self._vad = VadAnalyzer()
        self._prosody = ProsodyAnalyzer()
        self._talk_time = TalkTimeTracker()
        self._interruptions = InterruptionDetector()
        self._energy = EnergyScorer()
        self._drift = AttentionDriftDetector()
        self._response_latency = ResponseLatencyTracker()

        # Latest prosody features per session/role
        self._prosody_cache: dict[str, dict[str, dict[str, float]]] = defaultdict(dict)

        # Latest client metrics per session/role
        self._client_metrics: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)

        # Latest VAD state per session/role for interruption cross-referencing
        self._vad_state: dict[str, dict[str, bool]] = defaultdict(
            lambda: {"tutor": False, "student": False}
        )

        # Track previous drift state per session/role for change detection
        self._prev_drift: dict[str, dict[str, bool]] = defaultdict(
            lambda: {"tutor": False, "student": False}
        )
        # Pending drift changes to be consumed
        self._pending_drift_changes: dict[str, list[dict[str, Any]]] = defaultdict(list)

    def update_client_metrics(
        self,
        session_id: str,
        role: str,
        eye_contact: float | None,
        facial_energy: float | None,
        timestamp_ms: int,
    ) -> None:
        """Store latest client metrics and update drift detection.

        Args:
            session_id: Session identifier.
            role: "tutor" or "student".
            eye_contact: Eye contact score (0.0–1.0) or None.
            facial_energy: Facial energy score (0.0–1.0) or None.
            timestamp_ms: Timestamp in ms relative to session start.
        """
        # Treat null eye contact as 0.0 — face not detected means
        # the participant is not looking at the camera.
        effective_eye_contact = eye_contact if eye_contact is not None else 0.0

        self._client_metrics[session_id][role] = {
            "eye_contact": effective_eye_contact,
            "facial_energy": facial_energy,
            "timestamp_ms": timestamp_ms,
        }

        # Update energy with facial component (voice part comes from audio)
        # Update drift detection
        energy = self._compute_energy(session_id, role, facial_energy)
        drift_result = self._drift.update(
            session_id=session_id,
            role=role,
            eye_contact=effective_eye_contact,
            energy=energy,
            timestamp_ms=timestamp_ms,
        )

        # Detect drift state changes
        prev = self._prev_drift[session_id].get(role, False)
        if drift_result.drifting != prev:
            self._pending_drift_changes[session_id].append({
                "role": role,
                "drifting": drift_result.drifting,
                "reason": drift_result.reason,
                "timestamp_ms": timestamp_ms,
            })
            self._prev_drift[session_id][role] = drift_result.drifting

    def process_audio_chunk(
        self,
        session_id: str,
        role: str,
        b64_pcm: str,
        timestamp_ms: int,
    ) -> None:
        """Process an audio chunk through VAD, prosody, talk time, and interruptions.

        Args:
            session_id: Session identifier.
            role: "tutor" or "student".
            b64_pcm: Base64-encoded PCM audio data.
            timestamp_ms: Timestamp in ms relative to session start.
        """
        # VAD analysis
        vad_result = self._vad.analyze_chunk(b64_pcm)

        # Update talk time
        self._talk_time.update(
            session_id, role,
            speech_frames=vad_result["speech_frames"],
            total_frames=vad_result["total_frames"],
            timestamp_ms=timestamp_ms,
        )

        # Update VAD state for interruption detection
        self._vad_state[session_id][role] = vad_result["is_speech"]

        # Track response latency (speaker transitions)
        self._response_latency.update(
            session_id, role, vad_result["is_speech"], timestamp_ms
        )

        # Cross-reference for interruptions
        tutor_speech = self._vad_state[session_id]["tutor"]
        student_speech = self._vad_state[session_id]["student"]
        self._interruptions.update(
            session_id, tutor_speech, student_speech, timestamp_ms
        )

        # Prosody analysis (for energy scoring)
        prosody = self._prosody.analyze(b64_pcm)

        # Store latest prosody per role
        self._prosody_cache[session_id][role] = prosody

    def get_snapshot(self, session_id: str, timestamp_ms: int) -> dict[str, Any]:
        """Build a unified metrics snapshot for broadcasting.

        Args:
            session_id: Session identifier.
            timestamp_ms: Current timestamp in ms.

        Returns:
            Dict with all metric fields per ARCHITECTURE.md MetricSnapshot schema.
        """
        tutor_client = self._client_metrics.get(session_id, {}).get("tutor")
        student_client = self._client_metrics.get(session_id, {}).get("student")

        tutor_eye = tutor_client["eye_contact"] if tutor_client else None
        student_eye = student_client["eye_contact"] if student_client else None

        tutor_energy = self._compute_energy(
            session_id, "tutor",
            tutor_client["facial_energy"] if tutor_client else None,
        )
        student_energy = self._compute_energy(
            session_id, "student",
            student_client["facial_energy"] if student_client else None,
        )

        interruption_counts = self._interruptions.get_counts(session_id)

        # Get drift state
        tutor_drift = self._prev_drift[session_id].get("tutor", False)
        student_drift = self._prev_drift[session_id].get("student", False)

        # Determine drift reason (from last drift result)
        drift_reason = None
        for change in reversed(self._pending_drift_changes.get(session_id, [])):
            if change["drifting"]:
                drift_reason = change["reason"]
                break
        # Also check current state if no pending changes
        if drift_reason is None and (tutor_drift or student_drift):
            # Keep last known reason from prior changes
            pass

        return {
            "tutor_eye_contact": tutor_eye,
            "student_eye_contact": student_eye,
            "tutor_talk_pct": self._talk_time.get_talk_pct(session_id, "tutor"),
            "student_talk_pct": self._talk_time.get_talk_pct(session_id, "student"),
            "interruption_count": interruption_counts["total"],
            "tutor_energy": tutor_energy,
            "student_energy": student_energy,
            "tutor_attention_drift": tutor_drift,
            "student_attention_drift": student_drift,
            "drift_reason": drift_reason,
            "response_latency_ms": self._response_latency.get_avg_latency_ms(session_id),
            "tutor_is_speaking": self._vad_state[session_id].get("tutor", False),
            "student_is_speaking": self._vad_state[session_id].get("student", False),
            "timestamp_ms": timestamp_ms,
            "server_timestamp_ms": int(time.time() * 1000),
        }

    def get_speaking_state(self, session_id: str, role: str) -> bool:
        """Return whether a participant is currently speaking."""
        return self._vad_state[session_id].get(role, False)

    def get_drift_changes(self, session_id: str) -> list[dict[str, Any]]:
        """Consume and return any pending drift state changes.

        Returns:
            List of drift change dicts with role, drifting, reason, timestamp_ms.
        """
        changes = self._pending_drift_changes.pop(session_id, [])
        return changes

    def clear_session(self, session_id: str) -> None:
        """Clean up all state for a session."""
        self._talk_time.clear_session(session_id)
        self._interruptions.clear_session(session_id)
        self._drift.clear_session(session_id)
        self._response_latency.clear_session(session_id)
        self._client_metrics.pop(session_id, None)
        self._vad_state.pop(session_id, None)
        self._prev_drift.pop(session_id, None)
        self._pending_drift_changes.pop(session_id, None)
        self._prosody_cache.pop(session_id, None)

    def _compute_energy(
        self, session_id: str, role: str, facial_energy: float | None
    ) -> float | None:
        """Compute combined energy score for a participant."""
        prosody = self._prosody_cache.get(session_id, {}).get(role)

        if prosody is None and facial_energy is None:
            return None

        return self._energy.compute(prosody, facial_energy)
