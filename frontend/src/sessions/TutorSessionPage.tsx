/**
 * Tutor's live session page.
 *
 * Wires media capture, face mesh, audio/metrics streaming, live dashboard,
 * nudge toasts, and session lifecycle management. The tutor sees their own
 * webcam preview alongside the real-time engagement dashboard.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMediaCapture } from "../media/useMediaCapture";
import { useFaceMesh } from "../metrics/useFaceMesh";
import { GazeDebugOverlay } from "../metrics/GazeDebugOverlay";
import { CalibrationOverlay } from "../metrics/CalibrationOverlay";
import { GazeCalibrator } from "../metrics/gazeCalibration";
import { useMetricsStreaming } from "../shared/useMetricsStreaming";
import { useAudioStreaming } from "../shared/useAudioStreaming";
import { useWebSocketReady } from "../shared/useWebSocketReady";
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

  const { videoStream, status, error, consumeAudioChunks, isMuted, toggleMute } = useMediaCapture();
  const [calibrator, setCalibrator] = useState<GazeCalibrator | null>(null);
  const [calibrated, setCalibrated] = useState(false);
  const { eyeContactScore, facialEnergy, gazePoint, rawGazePoint, faceDetected } = useFaceMesh(videoEl, calibrator);
  const [showGazeDebug, setShowGazeDebug] = useState(false);
  const [showMetrics, setShowMetrics] = useState(true);
  const sessionStartMsRef = useRef(Date.now());

  const handleCalibrationComplete = useCallback((cal: GazeCalibrator) => {
    setCalibrator(cal);
    setCalibrated(true);
  }, []);

  const handleCalibrationSkip = useCallback(() => {
    setCalibrated(true);
  }, []);

  const getCalibrationSample = useCallback(() => {
    if (!rawGazePoint) return null;
    return { dx: rawGazePoint.x, dy: rawGazePoint.y };
  }, [rawGazePoint]);
  const { sessionEnded, endSession } = useTutorSessionControl(sessionId, token, ws);
  const wsReady = useWebSocketReady(ws);
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
      {/* Left column: webcam + controls — expands to full width when metrics hidden */}
      <div className={`flex flex-col border-r border-slate-800 bg-slate-950/50 backdrop-blur pt-4 px-4 pb-20 overflow-y-auto z-10 shrink-0 transition-all duration-300 ${showMetrics ? "w-80" : "w-full"}`}>
        <div className={`rounded-xl overflow-hidden bg-black mb-4 shadow-xl border-2 transition-colors duration-200 ${serverMetricsState.metrics?.tutor_is_speaking ? "border-green-400 shadow-green-400/20" : "border-slate-800 shadow-brand-purple/10"} ${showMetrics ? "" : "max-w-2xl mx-auto"}`}>
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
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggleMute}
              className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                isMuted
                  ? "bg-brand-red text-white shadow-lg shadow-brand-red/20"
                  : "bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
              data-testid="mute-toggle"
              title={isMuted ? "Unmute microphone" : "Mute microphone"}
            >
              {isMuted ? "Muted" : "Mic"}
            </button>
            <button
              onClick={() => setShowGazeDebug((v) => !v)}
              className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                showGazeDebug
                  ? "bg-brand-purple text-white shadow-lg shadow-brand-purple/20"
                  : "bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
              data-testid="gaze-debug-toggle"
            >
              Gaze
            </button>
          </div>
        </div>

        <GazeDebugOverlay
          gazePoint={gazePoint}
          eyeContactScore={eyeContactScore}
          visible={showGazeDebug}
        />
      </div>

      {/* Edge tab to toggle metrics panel — fixed to right edge, always visible */}
      <button
        onClick={() => setShowMetrics((v) => !v)}
        className="fixed top-1/2 right-0 -translate-y-1/2 z-40 group cursor-pointer bg-transparent border-none outline-none"
        data-testid="metrics-toggle"
        title={showMetrics ? "Hide metrics" : "Show metrics"}
      >
        <div className="h-16 w-6 rounded-l-lg bg-slate-800/90 border border-r-0 border-slate-700 group-hover:bg-slate-700 group-hover:border-slate-600 transition-colors flex items-center justify-center backdrop-blur-sm shadow-lg shadow-black/20">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`text-slate-400 group-hover:text-white transition-all ${showMetrics ? "rotate-0" : "rotate-180"}`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </button>

      {/* Right column: metrics panel — entire section retracts */}
      {showMetrics && (
        <div className="flex-1 overflow-y-auto bg-transparent z-0">
          <LiveDashboard state={serverMetricsState} wsReady={wsReady} />
        </div>
      )}

      {/* End Session — fixed to bottom, always visible */}
      <button
        onClick={endSession}
        className={`fixed bottom-6 z-40 rounded-xl bg-slate-800/90 border border-slate-700 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-red hover:border-brand-red hover:shadow-lg hover:shadow-brand-red/20 transition-all backdrop-blur-sm ${showMetrics ? "left-6" : "left-1/2 -translate-x-1/2"}`}
      >
        End Session
      </button>

      {/* Nudge toasts — fixed overlay, always visible regardless of metrics */}
      <NudgeContainer ws={ws} sessionStartMs={sessionStartMsRef.current} />

      {/* Calibration overlay — shown once at session start */}
      {!calibrated && status === "active" && (
        <CalibrationOverlay
          ready={faceDetected}
          onSample={getCalibrationSample}
          onComplete={handleCalibrationComplete}
          onSkip={handleCalibrationSkip}
        />
      )}
    </div>
  );
}
