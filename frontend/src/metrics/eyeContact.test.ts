import { describe, it, expect } from "vitest";
import { computeEyeContact, computeEyeContactFromBlendshapes, computeHeadPoseScore, type Landmark, type BlendshapeCategory } from "./eyeContact";

/**
 * MediaPipe Face Mesh landmark indices used:
 * - Left iris center: 468, Right iris center: 473
 * - Left eye: 33 (outer), 133 (inner), 159 (top), 145 (bottom)
 * - Right eye: 362 (inner), 263 (outer), 386 (top), 374 (bottom)
 * - Nose tip: 1, Left cheek: 234, Right cheek: 454
 *
 * Eye contact score combines:
 * - Iris centering (looking at camera vs away)
 * - Eye Aspect Ratio (eyes open vs closed/covered)
 * - Head pose (face oriented toward camera vs turned)
 */

function makeLandmarks(overrides: Record<number, Landmark>): Landmark[] {
  // Create a baseline set of 478 landmarks (468 face + 10 iris)
  const landmarks: Landmark[] = Array.from({ length: 478 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
  }));

  // Default eye geometry: eyes centered horizontally
  // Left eye (from viewer's perspective, person's right eye)
  landmarks[33] = { x: 0.35, y: 0.4, z: 0 }; // outer corner
  landmarks[133] = { x: 0.45, y: 0.4, z: 0 }; // inner corner
  landmarks[159] = { x: 0.4, y: 0.37, z: 0 }; // top
  landmarks[145] = { x: 0.4, y: 0.43, z: 0 }; // bottom

  // Right eye (from viewer's perspective, person's left eye)
  landmarks[362] = { x: 0.55, y: 0.4, z: 0 }; // inner corner
  landmarks[263] = { x: 0.65, y: 0.4, z: 0 }; // outer corner
  landmarks[386] = { x: 0.6, y: 0.37, z: 0 }; // top
  landmarks[374] = { x: 0.6, y: 0.43, z: 0 }; // bottom

  // Default iris: centered in each eye
  landmarks[468] = { x: 0.4, y: 0.4, z: 0 }; // left iris center
  landmarks[473] = { x: 0.6, y: 0.4, z: 0 }; // right iris center

  // Head pose landmarks: symmetric face facing camera
  landmarks[1] = { x: 0.5, y: 0.55, z: 0 };  // nose tip
  landmarks[234] = { x: 0.3, y: 0.45, z: 0 }; // left cheek
  landmarks[454] = { x: 0.7, y: 0.45, z: 0 }; // right cheek

  // Apply overrides
  for (const [idx, lm] of Object.entries(overrides)) {
    landmarks[Number(idx)] = lm;
  }

  return landmarks;
}

describe("computeEyeContact", () => {
  it("returns high score when iris is centered in both eyes", () => {
    const landmarks = makeLandmarks({});
    const score = computeEyeContact(landmarks);
    expect(score).toBeGreaterThanOrEqual(0.8);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it("returns low score when iris is at outer boundary of both eyes", () => {
    const landmarks = makeLandmarks({
      // Left iris pushed to outer corner
      468: { x: 0.35, y: 0.4, z: 0 },
      // Right iris pushed to outer corner
      473: { x: 0.65, y: 0.4, z: 0 },
    });
    const score = computeEyeContact(landmarks);
    expect(score).toBeLessThanOrEqual(0.3);
  });

  it("returns low score when looking up", () => {
    const landmarks = makeLandmarks({
      // Both irises pushed to top of eyes
      468: { x: 0.4, y: 0.37, z: 0 },
      473: { x: 0.6, y: 0.37, z: 0 },
    });
    const score = computeEyeContact(landmarks);
    expect(score).toBeLessThanOrEqual(0.5);
  });

  it("returns moderate score when slightly off-center", () => {
    const landmarks = makeLandmarks({
      // Slightly off-center
      468: { x: 0.38, y: 0.4, z: 0 },
      473: { x: 0.58, y: 0.4, z: 0 },
    });
    const score = computeEyeContact(landmarks);
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(0.8);
  });

  it("returns null when landmarks array is too short (no iris data)", () => {
    const landmarks = Array.from({ length: 468 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
    }));
    const score = computeEyeContact(landmarks);
    expect(score).toBeNull();
  });

  it("returns score between 0 and 1", () => {
    const landmarks = makeLandmarks({});
    const score = computeEyeContact(landmarks);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("averages left and right eye scores", () => {
    // Left eye centered, right eye looking away
    const landmarks = makeLandmarks({
      468: { x: 0.4, y: 0.4, z: 0 }, // centered
      473: { x: 0.65, y: 0.4, z: 0 }, // at boundary
    });
    const score = computeEyeContact(landmarks);
    // Should be between the two extremes
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(0.9);
  });

  it("still scores high when head is turned but iris is centered (gaze-primary)", () => {
    const landmarks = makeLandmarks({
      // Nose shifted right — head turned, but iris still centered
      1: { x: 0.62, y: 0.55, z: 0 },
    });
    const score = computeEyeContact(landmarks);
    // Eyes clearly open + iris centered = good score regardless of head turn
    expect(score).toBeGreaterThanOrEqual(0.8);
  });

  it("returns low score when eyes are closed or covered", () => {
    const landmarks = makeLandmarks({
      // Left eye nearly shut
      159: { x: 0.4, y: 0.395, z: 0 }, // top very close to bottom (0.43)
      145: { x: 0.4, y: 0.405, z: 0 },
      // Right eye nearly shut
      386: { x: 0.6, y: 0.395, z: 0 },
      374: { x: 0.6, y: 0.405, z: 0 },
    });
    const score = computeEyeContact(landmarks);
    expect(score).toBeLessThanOrEqual(0.1);
  });

  it("returns zero when eyes are fully closed", () => {
    const landmarks = makeLandmarks({
      // Both eyes: top = bottom (zero height)
      159: { x: 0.4, y: 0.4, z: 0 },
      145: { x: 0.4, y: 0.4, z: 0 },
      386: { x: 0.6, y: 0.4, z: 0 },
      374: { x: 0.6, y: 0.4, z: 0 },
    });
    const score = computeEyeContact(landmarks);
    expect(score).toBe(0);
  });

  it("uses head pose as fallback when eyes are barely open", () => {
    // Eyes nearly shut + head turned away → head pose kicks in as fallback
    const landmarks = makeLandmarks({
      1: { x: 0.62, y: 0.55, z: 0 }, // head turned
      // Nearly shut eyes — poor iris detection quality
      159: { x: 0.4, y: 0.41, z: 0 },
      145: { x: 0.4, y: 0.44, z: 0 },
      386: { x: 0.6, y: 0.41, z: 0 },
      374: { x: 0.6, y: 0.44, z: 0 },
    });
    const score = computeEyeContact(landmarks);
    // Low confidence in iris → head pose fallback → low score
    expect(score).toBeLessThan(0.5);
  });
});

/**
 * Helper to create blendshape categories with defaults (all zero = looking at camera).
 */
function makeBlendshapes(overrides: Record<string, number> = {}): BlendshapeCategory[] {
  const defaults: Record<string, number> = {
    eyeBlinkLeft: 0,
    eyeBlinkRight: 0,
    eyeLookOutLeft: 0,
    eyeLookOutRight: 0,
    eyeLookUpLeft: 0,
    eyeLookUpRight: 0,
    eyeLookDownLeft: 0,
    eyeLookDownRight: 0,
    eyeLookInLeft: 0,
    eyeLookInRight: 0,
  };
  const merged = { ...defaults, ...overrides };
  return Object.entries(merged).map(([categoryName, score]) => ({ categoryName, score }));
}

describe("computeHeadPoseScore", () => {
  it("returns 1.0 when face is symmetric (facing camera)", () => {
    const landmarks = makeLandmarks({});
    expect(computeHeadPoseScore(landmarks)).toBe(1);
  });

  it("returns low score when head is turned", () => {
    const landmarks = makeLandmarks({
      1: { x: 0.62, y: 0.55, z: 0 },
    });
    expect(computeHeadPoseScore(landmarks)).toBeLessThan(0.5);
  });

  it("returns 0 when head is fully turned away", () => {
    const landmarks = makeLandmarks({
      1: { x: 0.68, y: 0.55, z: 0 },
    });
    expect(computeHeadPoseScore(landmarks)).toBe(0);
  });
});

describe("computeEyeContactFromBlendshapes", () => {
  it("returns high score when looking at camera (all directions low)", () => {
    const score = computeEyeContactFromBlendshapes(makeBlendshapes());
    expect(score).toBeGreaterThanOrEqual(0.8);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it("returns low score when looking sideways", () => {
    const score = computeEyeContactFromBlendshapes(makeBlendshapes({
      eyeLookOutLeft: 0.7,
      eyeLookOutRight: 0.7,
    }));
    expect(score).toBeLessThanOrEqual(0.3);
  });

  it("returns low score when looking down (at notes/phone)", () => {
    const score = computeEyeContactFromBlendshapes(makeBlendshapes({
      eyeLookDownLeft: 0.6,
      eyeLookDownRight: 0.6,
    }));
    expect(score).toBeLessThanOrEqual(0.3);
  });

  it("returns low score when looking up", () => {
    const score = computeEyeContactFromBlendshapes(makeBlendshapes({
      eyeLookUpLeft: 0.6,
      eyeLookUpRight: 0.6,
    }));
    expect(score).toBeLessThanOrEqual(0.3);
  });

  it("returns zero when eyes are closed", () => {
    const score = computeEyeContactFromBlendshapes(makeBlendshapes({
      eyeBlinkLeft: 0.9,
      eyeBlinkRight: 0.9,
    }));
    expect(score).toBe(0);
  });

  it("returns null for empty blendshapes", () => {
    const score = computeEyeContactFromBlendshapes([]);
    expect(score).toBeNull();
  });

  it("returns moderate score when slightly looking away", () => {
    const score = computeEyeContactFromBlendshapes(makeBlendshapes({
      eyeLookOutLeft: 0.2,
      eyeLookOutRight: 0.2,
    }));
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(0.9);
  });

  it("penalizes partial eye closure", () => {
    const openScore = computeEyeContactFromBlendshapes(makeBlendshapes());
    const partialScore = computeEyeContactFromBlendshapes(makeBlendshapes({
      eyeBlinkLeft: 0.3,
      eyeBlinkRight: 0.3,
    }));
    expect(partialScore).toBeLessThan(openScore!);
    expect(partialScore).toBeGreaterThan(0);
  });

  it("returns score between 0 and 1", () => {
    const score = computeEyeContactFromBlendshapes(makeBlendshapes({
      eyeLookDownLeft: 0.3,
      eyeLookOutRight: 0.2,
    }));
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
