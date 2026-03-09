export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/**
 * MediaPipe Face Mesh iris landmark indices.
 * Left eye (person's right): iris center = 468
 * Right eye (person's left): iris center = 473
 */
const LEFT_IRIS_CENTER = 468;
const RIGHT_IRIS_CENTER = 473;

/** Eye boundary landmark indices */
const LEFT_EYE = {
  outer: 33,
  inner: 133,
  top: 159,
  bottom: 145,
} as const;

const RIGHT_EYE = {
  inner: 362,
  outer: 263,
  top: 386,
  bottom: 374,
} as const;

const MIN_LANDMARKS = 478;

/**
 * Compute eye contact score (0.0–1.0) from MediaPipe Face Mesh landmarks.
 *
 * The score measures how centered the iris is within the eye boundary.
 * A centered iris indicates the person is looking at the camera.
 *
 * @returns Score 0.0–1.0, or null if iris landmarks are missing.
 */
export function computeEyeContact(landmarks: Landmark[]): number | null {
  if (landmarks.length < MIN_LANDMARKS) {
    return null;
  }

  const leftScore = computeEyeScore(
    landmarks[LEFT_IRIS_CENTER],
    landmarks[LEFT_EYE.outer],
    landmarks[LEFT_EYE.inner],
    landmarks[LEFT_EYE.top],
    landmarks[LEFT_EYE.bottom],
  );

  const rightScore = computeEyeScore(
    landmarks[RIGHT_IRIS_CENTER],
    landmarks[RIGHT_EYE.outer],
    landmarks[RIGHT_EYE.inner],
    landmarks[RIGHT_EYE.top],
    landmarks[RIGHT_EYE.bottom],
  );

  return (leftScore + rightScore) / 2;
}

/**
 * Compute how centered the iris is within one eye.
 * Returns 1.0 when perfectly centered, 0.0 when at boundary.
 */
function computeEyeScore(
  iris: Landmark,
  outer: Landmark,
  inner: Landmark,
  top: Landmark,
  bottom: Landmark,
): number {
  // Eye center is midpoint of the bounding box
  const eyeCenterX = (outer.x + inner.x) / 2;
  const eyeCenterY = (top.y + bottom.y) / 2;

  // Eye dimensions (half-widths)
  const eyeHalfWidth = Math.abs(inner.x - outer.x) / 2;
  const eyeHalfHeight = Math.abs(bottom.y - top.y) / 2;

  // Guard against zero-size eyes
  if (eyeHalfWidth === 0 || eyeHalfHeight === 0) return 0;

  // Normalized distance from center (0 = centered, 1 = at boundary)
  const dx = Math.abs(iris.x - eyeCenterX) / eyeHalfWidth;
  const dy = Math.abs(iris.y - eyeCenterY) / eyeHalfHeight;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Convert distance to score: centered = 1.0, at boundary = 0.0
  return Math.max(0, Math.min(1, 1 - distance));
}
