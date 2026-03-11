/**
 * Tutor's live session page.
 *
 * Wires media capture, face mesh, audio/metrics streaming, live dashboard,
 * nudge toasts, and session lifecycle management. The tutor sees their own
 * webcam preview alongside the real-time engagement dashboard.
 */

import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMediaCapture } from "../media/useMediaCapture";
import { useFaceMesh } from "../metrics/useFaceMesh";
import { GazeDebugOverlay } from "../metrics/GazeDebugOverlay";
import { useMetricsStreaming } from "../shared/useMetricsStreaming";
import { useAudioStreaming } from "../shared/useAudioStreaming";
import { useServerMetrics } from "../dashboard/useServerMetrics";
import { useTutorSessionControl } from "./useTutorSessionControl";
import { LiveDashboard } from "../dashboard/LiveDashboard";
import { NudgeContainer } from "../nudges/NudgeContainer";

interface TutorSessionPageProps {
  sessionId: string;
  token: string;
  ws: WebSocket | null;
}

/**
 * Full tutor session view: webcam preview, live dashboard, nudge toasts,
 * and an "End Session" button.
 */
export function TutorSessionPage({ sessionId, token, ws }: TutorSessionPageProps) {
  const navigate = useNavigate();

  // Use callback ref so useFaceMesh receives the actual DOM element
  // (plain refs don't trigger re-renders when .current changes).
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const videoRefCallback = useCallback((node: HTMLVideoElement | null) => {
    setVideoEl(node);
  }, []);

  const { videoStream, status, error, consumeAudioChunks } = useMediaCapture();
  const { eyeContactScore, facialEnergy, gazePoint } = useFaceMesh(videoEl);
  const [showGazeDebug, setShowGazeDebug] = useState(false);
  const { sessionEnded, endSession } = useTutorSessionControl(sessionId, token, ws);
  const serverMetricsState = useServerMetrics(ws);

  // Stream metrics and audio to server
  useMetricsStreaming(ws, eyeContactScore, facialEnergy);
  const { sendAudioChunks } = useAudioStreaming(ws);

  // Flush audio chunks every second
  useEffect(() => {
    const interval = setInterval(() => {
      const chunks = consumeAudioChunks();
      if (chunks.length > 0) {
        sendAudioChunks(chunks);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [consumeAudioChunks, sendAudioChunks]);

  // Attach video stream to <video> element
  useEffect(() => {
    if (videoEl && videoStream) {
      videoEl.srcObject = videoStream;
    }
  }, [videoEl, videoStream]);

  // Navigate to analytics when session ends
  useEffect(() => {
    if (sessionEnded) {
      navigate(`/analytics/${sessionId}`, { replace: true });
    }
  }, [sessionEnded, sessionId, navigate]);

  if (status === "error") {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center max-w-md">
          <p className="text-red-600 mb-4">{error}</p>
          <p className="text-gray-500 text-sm">
            Camera access is required for the tutor session.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-57px)]" data-testid="tutor-session">
      {/* Left column: webcam + controls */}
      <div className="flex w-80 flex-col border-r bg-gray-900 p-4">
        <div className="rounded-lg overflow-hidden bg-black mb-4">
          <video
            ref={videoRefCallback}
            autoPlay
            playsInline
            muted
            className="w-full"
          />
        </div>

        <div className="flex items-center gap-2 mb-3">
          <span className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-white text-xs font-medium">Live</span>
          <button
            onClick={() => setShowGazeDebug((v) => !v)}
            className={`ml-auto rounded px-2 py-0.5 text-[10px] font-medium ${
              showGazeDebug
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-400 hover:text-gray-200"
            }`}
            data-testid="gaze-debug-toggle"
          >
            Gaze
          </button>
        </div>

        <GazeDebugOverlay
          gazePoint={gazePoint}
          eyeContactScore={eyeContactScore}
          visible={showGazeDebug}
        />

        <div className="mt-auto">
          <button
            onClick={endSession}
            className="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            End Session
          </button>
        </div>
      </div>

      {/* Right column: live dashboard */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <LiveDashboard state={serverMetricsState} />
      </div>

      {/* Nudge toast overlay */}
      <NudgeContainer ws={ws} />
    </div>
  );
}
