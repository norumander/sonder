/**
 * Lightweight gaze calibration overlay shown at session start.
 *
 * Asks the user to look at a central dot for a few seconds while the system
 * captures baseline iris position samples. This accounts for camera angle,
 * distance, and individual eye geometry.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { GazeCalibrator } from "./gazeCalibration";
import type { GazeOffset } from "./gazeCalibration";

const CALIBRATION_DURATION_MS = 3000;
const COUNTDOWN_SECONDS = 3;

interface CalibrationOverlayProps {
  /** Whether the video stream is active and face is detected. */
  ready: boolean;
  /** Called each frame with raw gaze offset to feed into calibrator. */
  onSample?: () => GazeOffset | null;
  /** Called when calibration completes with the computed offset. */
  onComplete: (calibrator: GazeCalibrator) => void;
  /** Called if user skips calibration. */
  onSkip: () => void;
}

export function CalibrationOverlay({ ready, onSample, onComplete, onSkip }: CalibrationOverlayProps) {
  const [phase, setPhase] = useState<"waiting" | "countdown" | "capturing">("waiting");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const calibratorRef = useRef(new GazeCalibrator());
  const captureStartRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  const startCalibration = useCallback(() => {
    setPhase("countdown");
    setCountdown(COUNTDOWN_SECONDS);
  }, []);

  // Countdown timer
  useEffect(() => {
    if (phase !== "countdown") return;

    if (countdown <= 0) {
      setPhase("capturing");
      captureStartRef.current = performance.now();
      return;
    }

    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, countdown]);

  // Capture samples during "capturing" phase
  useEffect(() => {
    if (phase !== "capturing" || !onSample) return;

    function capture() {
      const elapsed = performance.now() - captureStartRef.current;
      if (elapsed >= CALIBRATION_DURATION_MS) {
        const calibrator = calibratorRef.current;
        calibrator.finalize();
        onComplete(calibrator);
        return;
      }

      const sample = onSample!();
      if (sample) {
        calibratorRef.current.addSample(sample.dx, sample.dy);
      }
      rafRef.current = requestAnimationFrame(capture);
    }

    rafRef.current = requestAnimationFrame(capture);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [phase, onSample, onComplete]);

  if (!ready && phase === "waiting") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" data-testid="calibration-overlay">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-brand-teal mx-auto" />
          <p className="text-slate-300 text-sm">Waiting for camera...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" data-testid="calibration-overlay">
      <div className="text-center max-w-sm">
        {phase === "waiting" && (
          <>
            <div className="mb-6">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full border-2 border-brand-teal flex items-center justify-center">
                <div className="h-4 w-4 rounded-full bg-brand-teal shadow-[0_0_12px_rgba(45,212,191,0.6)]" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Quick Calibration</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Look directly at the dot for 3 seconds to calibrate eye tracking
                for your camera setup.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={startCalibration}
                className="rounded-xl bg-brand-teal px-6 py-2.5 text-sm font-semibold text-black hover:bg-brand-teal/90 transition-colors"
                data-testid="calibration-start"
              >
                Start
              </button>
              <button
                onClick={onSkip}
                className="rounded-xl bg-slate-800 border border-slate-700 px-6 py-2.5 text-sm font-semibold text-slate-300 hover:text-white transition-colors"
                data-testid="calibration-skip"
              >
                Skip
              </button>
            </div>
          </>
        )}

        {phase === "countdown" && (
          <>
            <div className="mx-auto mb-4 h-24 w-24 rounded-full border-2 border-brand-teal/50 flex items-center justify-center">
              <span className="text-4xl font-bold text-brand-teal">{countdown}</span>
            </div>
            <p className="text-slate-300 text-sm">Look at the dot above...</p>
          </>
        )}

        {phase === "capturing" && (
          <>
            <div className="mx-auto mb-4 h-24 w-24 rounded-full border-2 border-brand-teal flex items-center justify-center animate-pulse">
              <div className="h-6 w-6 rounded-full bg-brand-teal shadow-[0_0_20px_rgba(45,212,191,0.8)]" />
            </div>
            <p className="text-white font-medium text-sm">Keep looking at the dot...</p>
            <p className="text-slate-500 text-xs mt-1">Calibrating...</p>
          </>
        )}
      </div>
    </div>
  );
}
