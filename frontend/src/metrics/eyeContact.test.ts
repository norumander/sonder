import { describe, it, expect } from "vitest";
import { computeEyeContact, type Landmark } from "./eyeContact";

/**
 * MediaPipe Face Mesh 468-landmark model:
 * - Left iris center: landmark 468
 * - Right iris center: landmark 473
 * - Left eye corners: 33 (outer), 133 (inner)
 * - Left eye top/bottom: 159 (top), 145 (bottom)
 * - Right eye corners: 362 (inner), 263 (outer)
 * - Right eye top/bottom: 386 (top), 374 (bottom)
 *
 * Eye contact score = how centered iris is within the eye boundary.
 * Centered (looking at camera) → ≥0.8
 * At boundary (looking away) → ≤0.3
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
});
