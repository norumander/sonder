"""Server-side face analysis using MediaPipe Face Mesh.

Replicates client-side eye contact and facial energy computations
for pre-recorded video processing.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# MediaPipe Face Mesh iris landmark indices
LEFT_IRIS_CENTER = 468
RIGHT_IRIS_CENTER = 473

# Eye boundary landmark indices
LEFT_EYE = {"outer": 33, "inner": 133, "top": 159, "bottom": 145}
RIGHT_EYE = {"inner": 362, "outer": 263, "top": 386, "bottom": 374}

MIN_LANDMARKS = 478

# Expressive landmark indices for facial energy
EXPRESSIVE_LANDMARKS = [
    # Eyebrows
    70, 63, 105, 66, 107,
    336, 296, 334, 293, 300,
    # Mouth
    61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291,
    78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308,
    # Jaw
    172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397,
]

DISPLACEMENT_SCALE = 40


@dataclass
class FaceMetrics:
    """Face analysis results for a single frame."""

    eye_contact: float | None
    facial_energy: float | None


def compute_eye_contact(landmarks: list) -> float | None:
    """Compute eye contact score (0.0-1.0) from MediaPipe face landmarks.

    The score measures how centered the iris is within the eye boundary.
    A centered iris indicates the person is looking at the camera.

    Args:
        landmarks: List of landmark objects with x, y attributes.

    Returns:
        Score 0.0-1.0, or None if insufficient landmarks.
    """
    if len(landmarks) < MIN_LANDMARKS:
        return None

    left_score = _compute_eye_score(
        landmarks[LEFT_IRIS_CENTER],
        landmarks[LEFT_EYE["outer"]],
        landmarks[LEFT_EYE["inner"]],
        landmarks[LEFT_EYE["top"]],
        landmarks[LEFT_EYE["bottom"]],
    )

    right_score = _compute_eye_score(
        landmarks[RIGHT_IRIS_CENTER],
        landmarks[RIGHT_EYE["outer"]],
        landmarks[RIGHT_EYE["inner"]],
        landmarks[RIGHT_EYE["top"]],
        landmarks[RIGHT_EYE["bottom"]],
    )

    return (left_score + right_score) / 2


def compute_facial_energy(
    current: list, previous: list | None
) -> float | None:
    """Compute facial energy (0.0-1.0) from landmark displacement between frames.

    Compares key expressive landmarks (eyebrows, mouth, jaw) between the
    current and previous frame. More movement indicates higher energy.

    Args:
        current: Current frame landmarks.
        previous: Previous frame landmarks, or None.

    Returns:
        Energy 0.0-1.0, or None if no previous frame or mismatched lengths.
    """
    if previous is None:
        return None
    if len(current) != len(previous):
        return None

    total_displacement = 0.0
    count = 0

    for idx in EXPRESSIVE_LANDMARKS:
        if idx >= len(current):
            continue
        curr = current[idx]
        prev = previous[idx]

        dx = curr.x - prev.x
        dy = curr.y - prev.y
        total_displacement += math.sqrt(dx * dx + dy * dy)
        count += 1

    if count == 0:
        return None

    avg_displacement = total_displacement / count
    energy = min(1.0, avg_displacement * DISPLACEMENT_SCALE)

    return energy


def _compute_eye_score(iris, outer, inner, top, bottom) -> float:
    """Compute how centered the iris is within one eye.

    Returns 1.0 when perfectly centered, 0.0 when at boundary.
    """
    eye_center_x = (outer.x + inner.x) / 2
    eye_center_y = (top.y + bottom.y) / 2

    eye_half_width = abs(inner.x - outer.x) / 2
    eye_half_height = abs(bottom.y - top.y) / 2

    if eye_half_width == 0 or eye_half_height == 0:
        return 0.0

    dx = abs(iris.x - eye_center_x) / eye_half_width
    dy = abs(iris.y - eye_center_y) / eye_half_height
    distance = math.sqrt(dx * dx + dy * dy)

    return max(0.0, min(1.0, 1.0 - distance))
