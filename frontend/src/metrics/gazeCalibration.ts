/**
 * Lightweight gaze calibration that captures a "looking at camera" baseline.
 *
 * During calibration the user looks directly at the camera for a few seconds.
 * The calibrator collects raw iris offset samples and computes an average
 * offset that corrects for camera angle, distance, and individual eye geometry.
 *
 * After calibration, the offset is subtracted from raw gaze points so that
 * "looking at camera" maps to (0, 0).
 */

export interface GazeOffset {
  dx: number;
  dy: number;
}

const MIN_SAMPLES = 5;

export class GazeCalibrator {
  private samples: GazeOffset[] = [];
  private _offset: GazeOffset | null = null;

  /** Add a raw gaze sample captured while user looks at the camera. */
  addSample(dx: number, dy: number): void {
    this.samples.push({ dx, dy });
  }

  /** Number of samples collected so far. */
  get sampleCount(): number {
    return this.samples.length;
  }

  /**
   * Finalize calibration by computing the average offset.
   * Trims outlier samples (outside 1.5× IQR) for a more stable baseline.
   * Returns true if enough samples were collected, false otherwise.
   */
  finalize(): boolean {
    if (this.samples.length < MIN_SAMPLES) {
      return false;
    }

    const trimmed = trimOutliers(this.samples);
    // Fall back to all samples if too many were trimmed
    const usable = trimmed.length >= MIN_SAMPLES ? trimmed : this.samples;

    const sumDx = usable.reduce((sum, s) => sum + s.dx, 0);
    const sumDy = usable.reduce((sum, s) => sum + s.dy, 0);

    this._offset = {
      dx: sumDx / usable.length,
      dy: sumDy / usable.length,
    };

    return true;
  }

  /** The computed calibration offset, or null if not yet finalized. */
  get offset(): GazeOffset | null {
    return this._offset;
  }

  /**
   * Apply calibration correction to a raw gaze point.
   * Subtracts the baseline offset so "looking at camera" maps to (0, 0).
   * If uncalibrated, returns the raw point unchanged.
   */
  correct(rawX: number, rawY: number): { x: number; y: number } {
    if (!this._offset) {
      return { x: rawX, y: rawY };
    }
    return {
      x: Math.max(-1, Math.min(1, rawX - this._offset.dx)),
      y: Math.max(-1, Math.min(1, rawY - this._offset.dy)),
    };
  }

  /** Reset all state for a fresh calibration. */
  reset(): void {
    this.samples = [];
    this._offset = null;
  }
}

/**
 * Remove outlier samples using the IQR method on Euclidean distance from median.
 * Keeps samples within 1.5× IQR of the median distance.
 */
function trimOutliers(samples: GazeOffset[]): GazeOffset[] {
  if (samples.length < 4) return samples;

  // Find median dx and dy
  const sortedDx = samples.map((s) => s.dx).sort((a, b) => a - b);
  const sortedDy = samples.map((s) => s.dy).sort((a, b) => a - b);
  const medDx = sortedDx[Math.floor(sortedDx.length / 2)];
  const medDy = sortedDy[Math.floor(sortedDy.length / 2)];

  // Distance of each sample from the median center
  const distances = samples.map((s) =>
    Math.sqrt((s.dx - medDx) ** 2 + (s.dy - medDy) ** 2),
  );
  const sortedDist = [...distances].sort((a, b) => a - b);

  const q1 = sortedDist[Math.floor(sortedDist.length * 0.25)];
  const q3 = sortedDist[Math.floor(sortedDist.length * 0.75)];
  const iqr = q3 - q1;
  const cutoff = q3 + 1.5 * iqr;

  return samples.filter((_, i) => distances[i] <= cutoff);
}
