export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface BlendshapeCategory {
  categoryName: string;
  score: number;
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

/** Head pose landmark indices */
const NOSE_TIP = 1;
const LEFT_CHEEK = 234;
const RIGHT_CHEEK = 454;
const FOREHEAD = 10;
const CHIN = 152;

/** Head pitch thresholds — how far nose can deviate from expected vertical center */
const PITCH_PENALTY_START = 0.15;
const PITCH_PENALTY_FULL = 0.35;

const MIN_LANDMARKS = 478;

/** Eye Aspect Ratio thresholds */
const MIN_EAR = 0.15;
const GOOD_EAR = 0.3;

/** Head yaw asymmetry thresholds — relaxed so looking at the screen area is fine */
const YAW_PENALTY_START = 0.25;
const YAW_PENALTY_FULL = 0.5;

/**
 * Compute eye contact score (0.0–1.0) from MediaPipe Face Mesh landmarks.
 *
 * Primary signal is iris gaze direction. Head pose is used as a fallback
 * that blends in when eye detection quality is poor (eyes barely open,
 * squinting, or partially obscured). When eyes are clearly visible,
 * gaze direction alone determines the score.
 *
 * @returns Score 0.0–1.0, or null if iris landmarks are missing.
 */
export function computeEyeContact(landmarks: Landmark[]): number | null {
  if (landmarks.length < MIN_LANDMARKS) {
    return null;
  }

  // Eye openness — how reliably can we read the iris?
  const leftEAR = computeEAR(
    landmarks[LEFT_EYE.top],
    landmarks[LEFT_EYE.bottom],
    landmarks[LEFT_EYE.outer],
    landmarks[LEFT_EYE.inner],
  );
  const rightEAR = computeEAR(
    landmarks[RIGHT_EYE.top],
    landmarks[RIGHT_EYE.bottom],
    landmarks[RIGHT_EYE.outer],
    landmarks[RIGHT_EYE.inner],
  );
  const avgEAR = (leftEAR + rightEAR) / 2;
  const eyeOpenScore = earToScore(avgEAR);

  // If eyes are fully closed, no eye contact regardless
  if (eyeOpenScore === 0) return 0;

  // Iris centering — primary gaze signal
  const leftIrisScore = computeIrisScore(
    landmarks[LEFT_IRIS_CENTER],
    landmarks[LEFT_EYE.outer],
    landmarks[LEFT_EYE.inner],
    landmarks[LEFT_EYE.top],
    landmarks[LEFT_EYE.bottom],
  );
  const rightIrisScore = computeIrisScore(
    landmarks[RIGHT_IRIS_CENTER],
    landmarks[RIGHT_EYE.outer],
    landmarks[RIGHT_EYE.inner],
    landmarks[RIGHT_EYE.top],
    landmarks[RIGHT_EYE.bottom],
  );
  const irisScore = (leftIrisScore + rightIrisScore) / 2;

  // Head pose — fallback signal
  const headScore = computeHeadPoseScore(landmarks);

  // Blend: when eyes are wide open (eyeOpenScore ~1), trust iris fully.
  // When eyes are barely open (eyeOpenScore ~0), lean on head pose.
  // eyeConfidence ranges from 0 (poor iris data) to 1 (reliable iris data).
  const eyeConfidence = eyeOpenScore;
  const score = irisScore * eyeConfidence + headScore * (1 - eyeConfidence);

  return score * eyeOpenScore;
}

/**
 * Compute Eye Aspect Ratio: vertical height / horizontal width.
 * Low EAR means eyes are closed or covered.
 */
function computeEAR(
  top: Landmark,
  bottom: Landmark,
  outer: Landmark,
  inner: Landmark,
): number {
  const height = Math.abs(bottom.y - top.y);
  const width = Math.abs(inner.x - outer.x);
  if (width === 0) return 0;
  return height / width;
}

/** Convert EAR to a 0–1 score with linear ramp. */
function earToScore(ear: number): number {
  if (ear < MIN_EAR) return 0;
  if (ear >= GOOD_EAR) return 1;
  return (ear - MIN_EAR) / (GOOD_EAR - MIN_EAR);
}

/**
 * Estimate how directly the face is oriented toward the camera.
 *
 * Combines yaw (left/right turn) and pitch (up/down tilt) detection.
 * Returns 1.0 when facing camera, 0.0 when turned or tilted away.
 */
export function computeHeadPoseScore(landmarks: Landmark[]): number {
  const nose = landmarks[NOSE_TIP];
  const leftCheek = landmarks[LEFT_CHEEK];
  const rightCheek = landmarks[RIGHT_CHEEK];

  // --- Yaw (left/right) ---
  const leftDist = Math.abs(nose.x - leftCheek.x);
  const rightDist = Math.abs(rightCheek.x - nose.x);
  const totalWidth = leftDist + rightDist;

  let yawScore = 1;
  if (totalWidth >= 0.01) {
    const yawAsymmetry = Math.abs(leftDist - rightDist) / totalWidth;
    if (yawAsymmetry >= YAW_PENALTY_FULL) {
      yawScore = 0;
    } else if (yawAsymmetry > YAW_PENALTY_START) {
      yawScore = 1 - (yawAsymmetry - YAW_PENALTY_START) / (YAW_PENALTY_FULL - YAW_PENALTY_START);
    }
  }

  // --- Pitch (up/down) ---
  const forehead = landmarks[FOREHEAD];
  const chin = landmarks[CHIN];
  const faceHeight = Math.abs(chin.y - forehead.y);

  let pitchScore = 1;
  if (faceHeight >= 0.01) {
    // Expected nose position is ~55% from forehead to chin when facing camera
    const expectedNoseY = forehead.y + faceHeight * 0.55;
    const pitchDeviation = Math.abs(nose.y - expectedNoseY) / faceHeight;

    if (pitchDeviation >= PITCH_PENALTY_FULL) {
      pitchScore = 0;
    } else if (pitchDeviation > PITCH_PENALTY_START) {
      pitchScore = 1 - (pitchDeviation - PITCH_PENALTY_START) / (PITCH_PENALTY_FULL - PITCH_PENALTY_START);
    }
  }

  // Combined: both yaw and pitch must be good for a high score
  return yawScore * pitchScore;
}

/**
 * Compute how centered the iris is within one eye.
 * Returns 1.0 when perfectly centered, 0.0 when at boundary.
 */
function computeIrisScore(
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

/**
 * Estimated gaze position on a virtual screen, for debug visualization.
 * x: -1 (far left) to +1 (far right), 0 = center
 * y: -1 (looking up) to +1 (looking down), 0 = center
 */
export interface GazePoint {
  x: number;
  y: number;
}

/**
 * Estimate where the user is looking on the screen using iris offset + head yaw.
 *
 * Combines iris centering (where the iris sits in the eye socket) with
 * head pose (which way the head is turned). Returns a normalized point
 * where (0,0) is looking straight at the camera.
 *
 * @returns GazePoint with x,y in [-1, 1], or null if landmarks are insufficient.
 */
export function computeGazePoint(landmarks: Landmark[]): GazePoint | null {
  if (landmarks.length < MIN_LANDMARKS) return null;

  // Average iris offset from eye center (normalized by eye width/height)
  const leftIris = landmarks[LEFT_IRIS_CENTER];
  const rightIris = landmarks[RIGHT_IRIS_CENTER];

  const leftCenterX = (landmarks[LEFT_EYE.outer].x + landmarks[LEFT_EYE.inner].x) / 2;
  const leftCenterY = (landmarks[LEFT_EYE.top].y + landmarks[LEFT_EYE.bottom].y) / 2;
  const leftHalfW = Math.abs(landmarks[LEFT_EYE.inner].x - landmarks[LEFT_EYE.outer].x) / 2;
  const leftHalfH = Math.abs(landmarks[LEFT_EYE.bottom].y - landmarks[LEFT_EYE.top].y) / 2;

  const rightCenterX = (landmarks[RIGHT_EYE.outer].x + landmarks[RIGHT_EYE.inner].x) / 2;
  const rightCenterY = (landmarks[RIGHT_EYE.top].y + landmarks[RIGHT_EYE.bottom].y) / 2;
  const rightHalfW = Math.abs(landmarks[RIGHT_EYE.inner].x - landmarks[RIGHT_EYE.outer].x) / 2;
  const rightHalfH = Math.abs(landmarks[RIGHT_EYE.bottom].y - landmarks[RIGHT_EYE.top].y) / 2;

  if (leftHalfW === 0 || leftHalfH === 0 || rightHalfW === 0 || rightHalfH === 0) return null;

  // Iris offset from eye center, normalized to [-1, 1]
  const leftDx = (leftIris.x - leftCenterX) / leftHalfW;
  const leftDy = (leftIris.y - leftCenterY) / leftHalfH;
  const rightDx = (rightIris.x - rightCenterX) / rightHalfW;
  const rightDy = (rightIris.y - rightCenterY) / rightHalfH;

  const irisDx = (leftDx + rightDx) / 2;
  const irisDy = (leftDy + rightDy) / 2;

  // Head yaw contribution: nose offset from face center
  const nose = landmarks[NOSE_TIP];
  const leftCheek = landmarks[LEFT_CHEEK];
  const rightCheek = landmarks[RIGHT_CHEEK];
  const faceCenterX = (leftCheek.x + rightCheek.x) / 2;
  const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
  const headYaw = faceWidth > 0.01 ? (nose.x - faceCenterX) / (faceWidth / 2) : 0;

  // Combine iris gaze (local eye movement) + head yaw (global head turn)
  const gazeX = Math.max(-1, Math.min(1, irisDx * 0.6 + headYaw * 0.4));
  const gazeY = Math.max(-1, Math.min(1, irisDy));

  return { x: gazeX, y: gazeY };
}

/**
 * Exponential moving average filter for eye contact scores.
 *
 * Smooths frame-to-frame jitter while remaining responsive to real gaze
 * changes. The alpha parameter controls responsiveness: lower alpha = more
 * smoothing (slower response), higher alpha = less smoothing (faster response).
 */
export class EyeContactSmoother {
  private smoothed: number | null = null;
  private readonly alpha: number;

  /** @param alpha Smoothing factor in (0, 1]. Default 0.3 is a good balance. */
  constructor(alpha = 0.3) {
    this.alpha = Math.max(0.01, Math.min(1, alpha));
  }

  /** Feed a raw score and get back the smoothed value. */
  smooth(raw: number): number {
    if (this.smoothed === null) {
      this.smoothed = raw;
    } else {
      this.smoothed = this.alpha * raw + (1 - this.alpha) * this.smoothed;
    }
    return Math.max(0, Math.min(1, this.smoothed));
  }

  /** Clear state so the next sample is treated as the first. */
  reset(): void {
    this.smoothed = null;
  }
}

/**
 * Estimate gaze direction from MediaPipe face blendshapes.
 *
 * Uses eyeLookOut/In/Up/Down blendshapes which directly encode where
 * each eye is pointing — far more accurate for vertical tracking than
 * landmark-based iris centering (which relies on sub-pixel pupil position).
 *
 * @returns GazePoint with x,y in [-1, 1], or null if blendshapes are missing.
 */
export function computeGazePointFromBlendshapes(
  blendshapes: BlendshapeCategory[],
): GazePoint | null {
  if (blendshapes.length === 0) return null;

  const scores = new Map<string, number>();
  for (const bs of blendshapes) {
    scores.set(bs.categoryName, bs.score);
  }

  // Horizontal: Out = away from nose, In = toward nose
  // Left eye: Out = looking left, In = looking right
  // Right eye: Out = looking right, In = looking left
  const lookOutL = scores.get("eyeLookOutLeft") ?? 0;
  const lookInL = scores.get("eyeLookInLeft") ?? 0;
  const lookOutR = scores.get("eyeLookOutRight") ?? 0;
  const lookInR = scores.get("eyeLookInRight") ?? 0;

  // Left eye x: negative=left, positive=right
  const leftEyeX = -lookOutL + lookInL;
  // Right eye x: negative=left, positive=right
  const rightEyeX = -lookInR + lookOutR;
  const gazeX = (leftEyeX + rightEyeX) / 2;

  // Vertical
  const lookUpL = scores.get("eyeLookUpLeft") ?? 0;
  const lookUpR = scores.get("eyeLookUpRight") ?? 0;
  const lookDownL = scores.get("eyeLookDownLeft") ?? 0;
  const lookDownR = scores.get("eyeLookDownRight") ?? 0;

  const leftEyeY = -lookUpL + lookDownL;
  const rightEyeY = -lookUpR + lookDownR;
  const gazeY = (leftEyeY + rightEyeY) / 2;

  // Amplify slightly — blendshape scores are subtle (typically 0–0.5 range)
  const AMP = 1.5;
  return {
    x: Math.max(-1, Math.min(1, gazeX * AMP)),
    y: Math.max(-1, Math.min(1, gazeY * AMP)),
  };
}

/**
 * Exponential moving average filter for gaze points (x, y).
 *
 * Smooths frame-to-frame jitter on both axes independently. Resets
 * when face is lost so the first sample after re-detection isn't
 * pulled toward the old position.
 */
export class GazePointSmoother {
  private sx: number | null = null;
  private sy: number | null = null;
  private readonly alpha: number;

  /** @param alpha Smoothing factor in (0, 1]. Default 0.35. */
  constructor(alpha = 0.35) {
    this.alpha = Math.max(0.01, Math.min(1, alpha));
  }

  smooth(point: GazePoint): GazePoint {
    if (this.sx === null || this.sy === null) {
      this.sx = point.x;
      this.sy = point.y;
    } else {
      this.sx = this.alpha * point.x + (1 - this.alpha) * this.sx;
      this.sy = this.alpha * point.y + (1 - this.alpha) * this.sy;
    }
    return {
      x: Math.max(-1, Math.min(1, this.sx)),
      y: Math.max(-1, Math.min(1, this.sy)),
    };
  }

  reset(): void {
    this.sx = null;
    this.sy = null;
  }
}

/**
 * Compute eye contact score from MediaPipe face blendshapes.
 *
 * Uses the model's direct gaze direction outputs (eyeLookOut, eyeLookUp,
 * eyeLookDown) and blink scores rather than geometric iris centering.
 * This is significantly more accurate for detecting when someone is
 * looking away, looking down at notes, or has their eyes covered.
 *
 * @returns Score 0.0–1.0, or null if blendshapes are missing.
 */
export function computeEyeContactFromBlendshapes(
  blendshapes: BlendshapeCategory[],
): number | null {
  if (blendshapes.length === 0) return null;

  const scores = new Map<string, number>();
  for (const bs of blendshapes) {
    scores.set(bs.categoryName, bs.score);
  }

  // Eye blink — eyes closed/covered means no eye contact
  const blinkL = scores.get("eyeBlinkLeft") ?? 0;
  const blinkR = scores.get("eyeBlinkRight") ?? 0;
  const avgBlink = (blinkL + blinkR) / 2;

  // If eyes are mostly closed, score drops sharply
  const openness = Math.max(0, 1 - avgBlink * 2);
  if (openness === 0) return 0;

  // Gaze direction — how much are eyes looking away from center?
  // Each score is 0 (not looking that direction) to 1 (fully looking)
  const lookOutL = scores.get("eyeLookOutLeft") ?? 0;
  const lookOutR = scores.get("eyeLookOutRight") ?? 0;
  const lookUpL = scores.get("eyeLookUpLeft") ?? 0;
  const lookUpR = scores.get("eyeLookUpRight") ?? 0;
  const lookDownL = scores.get("eyeLookDownLeft") ?? 0;
  const lookDownR = scores.get("eyeLookDownRight") ?? 0;

  // For each eye, take the strongest "away" signal
  const leftAway = Math.max(lookOutL, lookUpL, lookDownL);
  const rightAway = Math.max(lookOutR, lookUpR, lookDownR);
  const avgAway = (leftAway + rightAway) / 2;

  // Convert to eye contact score: center = 1.0, looking away = 0.0
  // Gentle amplification — looking at the general screen area is fine
  const gazeScore = Math.max(0, Math.min(1, 1 - avgAway * 1.2));

  return gazeScore * openness;
}
