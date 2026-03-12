import { useState, useEffect, useRef, useCallback } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { computeEyeContact, computeEyeContactFromBlendshapes, computeGazePoint, computeGazePointFromBlendshapes, EyeContactSmoother, GazePointSmoother } from "./eyeContact";
import type { GazePoint } from "./eyeContact";
import { computeFacialEnergy } from "./facialEnergy";
import type { Landmark } from "./eyeContact";
import type { GazeCalibrator } from "./gazeCalibration";

/** Minimum time between frame processing to avoid overloading the GPU. */
const MIN_FRAME_INTERVAL_MS = 150;

export interface FaceMeshState {
  eyeContactScore: number | null;
  facialEnergy: number | null;
  faceDetected: boolean;
  gazePoint: GazePoint | null;
  /** Raw gaze point before calibration correction, for use during calibration. */
  rawGazePoint: GazePoint | null;
}

/**
 * Hook that runs MediaPipe Face Landmarker on a video element and computes
 * eye contact score and facial energy using requestAnimationFrame with a
 * minimum interval of ~150ms (~7 FPS).
 *
 * Enables face blendshapes for accurate gaze direction detection.
 * Falls back to landmark-based iris centering if blendshapes are unavailable.
 *
 * @param videoElement The HTMLVideoElement to process, or null if not ready
 * @param calibrator Optional gaze calibrator to correct for camera angle/distance
 * @returns Current eye contact score, facial energy, and face detection status
 */
export function useFaceMesh(
  videoElement: HTMLVideoElement | null,
  calibrator?: GazeCalibrator | null,
): FaceMeshState {
  const [eyeContactScore, setEyeContactScore] = useState<number | null>(null);
  const [facialEnergy, setFacialEnergy] = useState<number | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [gazePoint, setGazePoint] = useState<GazePoint | null>(null);
  const [rawGazePoint, setRawGazePoint] = useState<GazePoint | null>(null);

  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const prevLandmarksRef = useRef<Landmark[] | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastProcessedRef = useRef<number>(0);
  const smootherRef = useRef(new EyeContactSmoother(0.3));
  const gazeSmootherRef = useRef(new GazePointSmoother(0.35));

  const processFrame = useCallback(() => {
    if (!landmarkerRef.current || !videoElement) return;
    if (videoElement.readyState < 2 || videoElement.videoWidth === 0) return;

    const result = landmarkerRef.current.detectForVideo(videoElement, performance.now());

    if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
      setFaceDetected(false);
      setEyeContactScore(null);
      setFacialEnergy(null);
      setGazePoint(null);
      setRawGazePoint(null);
      prevLandmarksRef.current = null;
      smootherRef.current.reset();
      gazeSmootherRef.current.reset();
      return;
    }

    const landmarks = result.faceLandmarks[0] as Landmark[];
    setFaceDetected(true);

    // Prefer blendshapes — they directly measure gaze direction
    let eyeScore: number | null = null;
    if (result.faceBlendshapes && result.faceBlendshapes.length > 0) {
      eyeScore = computeEyeContactFromBlendshapes(result.faceBlendshapes[0].categories);
    }
    // Fall back to landmark-based iris + head pose blend
    if (eyeScore === null) {
      eyeScore = computeEyeContact(landmarks);
    }
    setEyeContactScore(eyeScore !== null ? smootherRef.current.smooth(eyeScore) : null);

    // Prefer blendshape gaze — direct eye direction, much better Y-axis tracking
    let rawGaze: GazePoint | null = null;
    if (result.faceBlendshapes && result.faceBlendshapes.length > 0) {
      rawGaze = computeGazePointFromBlendshapes(result.faceBlendshapes[0].categories);
    }
    // Fall back to landmark-based iris centering + head pose
    if (!rawGaze) {
      rawGaze = computeGazePoint(landmarks);
    }
    // Expose unsmoothed raw for calibration sampling
    setRawGazePoint(rawGaze);
    // Smooth gaze point to reduce jitter, then apply calibration correction
    if (rawGaze) {
      const smoothed = gazeSmootherRef.current.smooth(rawGaze);
      if (calibrator?.offset) {
        setGazePoint(calibrator.correct(smoothed.x, smoothed.y));
      } else {
        setGazePoint(smoothed);
      }
    } else {
      setGazePoint(null);
    }

    const energy = computeFacialEnergy(landmarks, prevLandmarksRef.current);
    setFacialEnergy(energy);

    prevLandmarksRef.current = landmarks;
  }, [videoElement]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
      );

      if (cancelled) return;

      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        minFaceDetectionConfidence: 0.7,
        minFacePresenceConfidence: 0.7,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
      });

      if (cancelled) {
        landmarker.close();
        return;
      }

      landmarkerRef.current = landmarker;

      // Start rAF-based processing loop with throttle
      if (videoElement) {
        function loop() {
          if (cancelled) return;
          const now = performance.now();
          if (now - lastProcessedRef.current >= MIN_FRAME_INTERVAL_MS) {
            lastProcessedRef.current = now;
            processFrame();
          }
          rafRef.current = requestAnimationFrame(loop);
        }
        rafRef.current = requestAnimationFrame(loop);
      }
    }

    if (videoElement) {
      init();
    }

    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
      prevLandmarksRef.current = null;
    };
  }, [videoElement, processFrame]);

  return { eyeContactScore, facialEnergy, faceDetected, gazePoint, rawGazePoint };
}
