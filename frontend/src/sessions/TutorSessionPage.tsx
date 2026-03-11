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
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center p-4">
        <div className="text-center max-w-md p-8 glass-panel rounded-2xl border-red-500/30">
          <p className="text-red-400 mb-4 font-medium">{error}</p>
          <p className="text-slate-400 text-sm">
            Camera access is required for the tutor session.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-64px)]" data-testid="tutor-session">
      {/* Left column: webcam + controls */}
      <div className="flex w-80 flex-col border-r border-slate-800 bg-slate-950/50 backdrop-blur pb-6 pt-4 px-4 z-10 shrink-0">
        <div className="rounded-xl overflow-hidden bg-black mb-4 shadow-xl shadow-brand-purple/10 border border-slate-800">
          <video
            ref={videoRefCallback}
            autoPlay
            playsInline
            muted
            className="w-full"
          />
        </div>

        <div className="flex items-center gap-3 mb-4 bg-slate-900 rounded-lg px-3 py-2 border border-slate-800">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-teal shadow-[0_0_8px_rgba(45,212,191,0.6)] animate-pulse" />
          <span className="text-white text-xs font-semibold tracking-wide">Live</span>
          <button
            onClick={() => setShowGazeDebug((v) => !v)}
            className={`ml-auto rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
              showGazeDebug
                ? "bg-brand-purple text-white shadow-lg shadow-brand-purple/20"
                : "bg-slate-800 text-slate-400 hover:text-slate-200"
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

        <div className="mt-auto pt-4">
          <button
            onClick={endSession}
            className="w-full rounded-xl bg-slate-800/80 border border-slate-700 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-red hover:border-brand-red hover:shadow-lg hover:shadow-brand-red/20 transition-all"
          >
            End Session
          </button>
        </div>
      </div>

      {/* Right column: live dashboard */}
      <div className="flex-1 overflow-y-auto bg-transparent relative z-0">
        <LiveDashboard state={serverMetricsState} />
      </div>

      {/* Nudge toast overlay */}
      <NudgeContainer ws={ws} />
    </div>
  );
}
