import { describe, it, expect } from "vitest";
import { GazeCalibrator } from "./gazeCalibration";

describe("GazeCalibrator", () => {
  it("starts with no offset", () => {
    const cal = new GazeCalibrator();
    expect(cal.offset).toBeNull();
    expect(cal.sampleCount).toBe(0);
  });

  it("tracks sample count", () => {
    const cal = new GazeCalibrator();
    cal.addSample(0.1, 0.05);
    cal.addSample(0.12, 0.04);
    expect(cal.sampleCount).toBe(2);
  });

  it("fails to finalize with fewer than 5 samples", () => {
    const cal = new GazeCalibrator();
    for (let i = 0; i < 4; i++) {
      cal.addSample(0.1, 0.05);
    }
    expect(cal.finalize()).toBe(false);
    expect(cal.offset).toBeNull();
  });

  it("finalizes successfully with 5+ samples and computes average offset", () => {
    const cal = new GazeCalibrator();
    // All samples show user's iris is shifted right by 0.1 and down by 0.05
    for (let i = 0; i < 6; i++) {
      cal.addSample(0.1, 0.05);
    }
    expect(cal.finalize()).toBe(true);
    expect(cal.offset).not.toBeNull();
    expect(cal.offset!.dx).toBeCloseTo(0.1);
    expect(cal.offset!.dy).toBeCloseTo(0.05);
  });

  it("computes correct average from varying samples", () => {
    const cal = new GazeCalibrator();
    cal.addSample(0.1, 0.02);
    cal.addSample(0.2, 0.04);
    cal.addSample(0.1, 0.06);
    cal.addSample(0.2, 0.08);
    cal.addSample(0.1, 0.05);
    expect(cal.finalize()).toBe(true);
    expect(cal.offset!.dx).toBeCloseTo(0.14);
    expect(cal.offset!.dy).toBeCloseTo(0.05);
  });

  it("corrects raw gaze point by subtracting the baseline offset", () => {
    const cal = new GazeCalibrator();
    for (let i = 0; i < 5; i++) {
      cal.addSample(0.2, -0.1);
    }
    cal.finalize();

    // Raw reading of (0.2, -0.1) should map to (0, 0) after correction
    const corrected = cal.correct(0.2, -0.1);
    expect(corrected.x).toBeCloseTo(0);
    expect(corrected.y).toBeCloseTo(0);
  });

  it("clamps corrected values to [-1, 1]", () => {
    const cal = new GazeCalibrator();
    for (let i = 0; i < 5; i++) {
      cal.addSample(-0.5, 0.5);
    }
    cal.finalize();

    // Large raw value + correction should clamp
    const corrected = cal.correct(0.9, -0.9);
    expect(corrected.x).toBeLessThanOrEqual(1);
    expect(corrected.y).toBeGreaterThanOrEqual(-1);
  });

  it("returns raw values unchanged when not calibrated", () => {
    const cal = new GazeCalibrator();
    const corrected = cal.correct(0.3, -0.2);
    expect(corrected.x).toBeCloseTo(0.3);
    expect(corrected.y).toBeCloseTo(-0.2);
  });

  it("resets all state", () => {
    const cal = new GazeCalibrator();
    for (let i = 0; i < 5; i++) {
      cal.addSample(0.1, 0.1);
    }
    cal.finalize();
    expect(cal.offset).not.toBeNull();

    cal.reset();
    expect(cal.offset).toBeNull();
    expect(cal.sampleCount).toBe(0);
  });
});
