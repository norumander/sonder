import { useState, useEffect, useRef, useCallback } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { computeEyeContact, computeEyeContactFromBlendshapes, computeGazePoint } from "./eyeContact";
import type { GazePoint } from "./eyeContact";
import { computeFacialEnergy } from "./facialEnergy";
import type { Landmark } from "./eyeContact";

const UPDATE_INTERVAL_MS = 500;

export interface FaceMeshState {
  eyeContactScore: number | null;
  facialEnergy: number | null;
  faceDetected: boolean;
  gazePoint: GazePoint | null;
}

/**
 * Hook that runs MediaPipe Face Landmarker on a video element and computes
 * eye contact score and facial energy every 500ms.
 *
 * Enables face blendshapes for accurate gaze direction detection.
 * Falls back to landmark-based iris centering if blendshapes are unavailable.
 *
 * @param videoElement The HTMLVideoElement to process, or null if not ready
 * @returns Current eye contact score, facial energy, and face detection status
 */
export function useFaceMesh(
  videoElement: HTMLVideoElement | null,
): FaceMeshState {
  const [eyeContactScore, setEyeContactScore] = useState<number | null>(null);
  const [facialEnergy, setFacialEnergy] = useState<number | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [gazePoint, setGazePoint] = useState<GazePoint | null>(null);

  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const prevLandmarksRef = useRef<Landmark[] | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const processFrame = useCallback(() => {
    if (!landmarkerRef.current || !videoElement) return;
    if (videoElement.readyState < 2 || videoElement.videoWidth === 0) return;

    const result = landmarkerRef.current.detectForVideo(videoElement, performance.now());

    if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
      setFaceDetected(false);
      setEyeContactScore(null);
      setFacialEnergy(null);
      setGazePoint(null);
      prevLandmarksRef.current = null;
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
    setEyeContactScore(eyeScore);
    setGazePoint(computeGazePoint(landmarks));

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

      // Start processing at UPDATE_INTERVAL_MS
      if (videoElement) {
        processFrame();
        intervalRef.current = setInterval(processFrame, UPDATE_INTERVAL_MS);
      }
    }

    if (videoElement) {
      init();
    }

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
      prevLandmarksRef.current = null;
    };
  }, [videoElement, processFrame]);

  return { eyeContactScore, facialEnergy, faceDetected, gazePoint };
}
