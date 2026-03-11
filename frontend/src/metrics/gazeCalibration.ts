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
   * Returns true if enough samples were collected, false otherwise.
   */
  finalize(): boolean {
    if (this.samples.length < MIN_SAMPLES) {
      return false;
    }

    const sumDx = this.samples.reduce((sum, s) => sum + s.dx, 0);
    const sumDy = this.samples.reduce((sum, s) => sum + s.dy, 0);

    this._offset = {
      dx: sumDx / this.samples.length,
      dy: sumDy / this.samples.length,
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
