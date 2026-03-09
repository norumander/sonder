import { describe, it, expect } from "vitest";
import {
  computeFacialEnergy,
  type Landmark,
} from "./facialEnergy";

/**
 * Facial energy is computed from landmark displacement between frames.
 * More movement (expressions changing) → higher energy.
 * Static face → low energy.
 */

function makeNeutralFace(): Landmark[] {
  return Array.from({ length: 478 }, (_, i) => ({
    x: 0.5 + (i % 20) * 0.01,
    y: 0.5 + Math.floor(i / 20) * 0.01,
    z: 0,
  }));
}

function makeDisplacedFace(displacement: number): Landmark[] {
  return Array.from({ length: 478 }, (_, i) => ({
    x: 0.5 + (i % 20) * 0.01 + (Math.sin(i) * displacement),
    y: 0.5 + Math.floor(i / 20) * 0.01 + (Math.cos(i) * displacement),
    z: 0,
  }));
}

describe("computeFacialEnergy", () => {
  it("returns null when no previous frame exists", () => {
    const face = makeNeutralFace();
    const energy = computeFacialEnergy(face, null);
    expect(energy).toBeNull();
  });

  it("returns low energy when face is static between frames", () => {
    const face = makeNeutralFace();
    const energy = computeFacialEnergy(face, face);
    expect(energy).toBeLessThanOrEqual(0.1);
  });

  it("returns high energy when face has large displacement", () => {
    const prev = makeNeutralFace();
    const curr = makeDisplacedFace(0.05);
    const energy = computeFacialEnergy(curr, prev);
    expect(energy).toBeGreaterThanOrEqual(0.5);
  });

  it("returns moderate energy for moderate displacement", () => {
    const prev = makeNeutralFace();
    const curr = makeDisplacedFace(0.015);
    const energy = computeFacialEnergy(curr, prev);
    expect(energy).toBeGreaterThan(0.1);
    expect(energy).toBeLessThan(0.8);
  });

  it("returns value between 0 and 1", () => {
    const prev = makeNeutralFace();
    const curr = makeDisplacedFace(0.1);
    const energy = computeFacialEnergy(curr, prev);
    expect(energy).toBeGreaterThanOrEqual(0);
    expect(energy).toBeLessThanOrEqual(1);
  });

  it("returns null when landmarks arrays have different lengths", () => {
    const prev = makeNeutralFace();
    const curr = prev.slice(0, 100);
    const energy = computeFacialEnergy(curr, prev);
    expect(energy).toBeNull();
  });
});
