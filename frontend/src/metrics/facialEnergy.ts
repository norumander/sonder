export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/**
 * Key facial landmark indices for energy computation.
 * Focus on expressive regions: eyebrows, mouth, jaw.
 */
const EXPRESSIVE_LANDMARKS = [
  // Eyebrows
  70, 63, 105, 66, 107, // left eyebrow
  336, 296, 334, 293, 300, // right eyebrow
  // Mouth
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, // outer lip
  78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, // inner lip
  // Jaw
  172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397,
] as const;

/**
 * Scaling factor to normalize raw displacement into 0–1 range.
 * Tuned so that typical expressive movement maps to ~0.7 energy.
 */
const DISPLACEMENT_SCALE = 40;

/**
 * Compute facial energy (0.0–1.0) from landmark displacement between frames.
 *
 * Compares key expressive landmarks (eyebrows, mouth, jaw) between the
 * current and previous frame. More movement indicates higher energy.
 *
 * @param current Current frame landmarks
 * @param previous Previous frame landmarks (null on first frame)
 * @returns Energy 0.0–1.0, or null if previous frame unavailable or mismatched
 */
export function computeFacialEnergy(
  current: Landmark[],
  previous: Landmark[] | null,
): number | null {
  if (!previous) return null;
  if (current.length !== previous.length) return null;

  let totalDisplacement = 0;
  let count = 0;

  for (const idx of EXPRESSIVE_LANDMARKS) {
    if (idx >= current.length) continue;
    const curr = current[idx];
    const prev = previous[idx];

    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    totalDisplacement += Math.sqrt(dx * dx + dy * dy);
    count++;
  }

  if (count === 0) return null;

  const avgDisplacement = totalDisplacement / count;
  // Scale to 0–1 range with sigmoid-like clamping
  const energy = Math.min(1, avgDisplacement * DISPLACEMENT_SCALE);

  return energy;
}
