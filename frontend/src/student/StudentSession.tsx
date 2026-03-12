import { useState, useCallback, useEffect } from "react";
import { useMediaCapture } from "../media/useMediaCapture";
import { useFaceMesh } from "../metrics/useFaceMesh";
import { CalibrationOverlay } from "../metrics/CalibrationOverlay";
import { GazeCalibrator } from "../metrics/gazeCalibration";
import { useMetricsStreaming } from "../shared/useMetricsStreaming";
import { useAudioStreaming } from "../shared/useAudioStreaming";

interface StudentSessionProps {
  sessionId: string;
  token: string;
  ws: WebSocket | null;
  /** Whether the tutor is currently connected (managed by parent StudentFlow). */
  tutorConnected: boolean;
  onLeave?: () => void;
}

/**
 * Student's session view. Shows webcam preview, "Session active" indicator,
 * and "Leave session" button. No metrics, charts, or nudges are displayed.
 *
 * Streams face metrics and audio to the server via WebSocket.
 * Session-ended detection and tutor status tracking are handled by the parent (StudentFlow).
 */
export function StudentSession({ ws, tutorConnected, onLeave }: StudentSessionProps) {
  // Use callback ref so useFaceMesh receives the actual DOM element
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const videoRefCallback = useCallback((node: HTMLVideoElement | null) => {
    setVideoEl(node);
  }, []);

  const { videoStream, status, error, consumeAudioChunks, isMuted, toggleMute } = useMediaCapture();
  const [calibrator, setCalibrator] = useState<GazeCalibrator | null>(null);
  const [calibrated, setCalibrated] = useState(false);
  const { eyeContactScore, facialEnergy, faceDetected, rawGazePoint } = useFaceMesh(videoEl, calibrator);

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

  // Listen for speaking_state messages from backend
  const [isSpeaking, setIsSpeaking] = useState(false);
  useEffect(() => {
    if (!ws) return;
    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "speaking_state") {
          setIsSpeaking(msg.data.is_speaking);
        }
      } catch { /* ignore parse errors */ }
    };
    ws.addEventListener("message", handler);
    return () => ws.removeEventListener("message", handler);
  }, [ws]);

  // Request current session status on mount — syncs state in case
  // we missed a tutor_status message (e.g., rejoin after leaving).
  useEffect(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "request_status" }));
  }, [ws]);

  // Stream metrics and audio to server
  useMetricsStreaming(ws, eyeContactScore, facialEnergy);
  const { sendAudioChunks } = useAudioStreaming(ws);

  // Flush audio chunks periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const chunks = consumeAudioChunks();
      if (chunks.length > 0) {
        sendAudioChunks(chunks);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [consumeAudioChunks, sendAudioChunks]);

  // Attach video stream to <video> element
  useEffect(() => {
    if (videoEl && videoStream) {
      videoEl.srcObject = videoStream;
    }
  }, [videoEl, videoStream]);

  if (status === "error") {
    return (
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center">
        <div className="text-center max-w-md p-8 glass-panel rounded-2xl border-red-500/30">
          <p className="text-red-400 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-center p-4">
      {/* Webcam preview */}
      <div className={`relative w-full max-w-lg rounded-2xl overflow-hidden bg-black mb-6 shadow-2xl border-2 transition-colors duration-200 ${isSpeaking ? "border-green-400 shadow-green-400/20" : "border-slate-800 shadow-brand-teal/10"}`}>
        <video
          ref={videoRefCallback}
          autoPlay
          playsInline
          muted
          className="w-full"
        />
      </div>

      {/* Session status indicator */}
      {tutorConnected ? (
        <div className="flex items-center gap-3 mb-8 glass-panel rounded-full px-6 py-3">
          <span className="h-3 w-3 rounded-full bg-brand-teal shadow-[0_0_10px_rgba(45,212,191,0.5)] animate-pulse" />
          <span className="text-white text-sm font-semibold tracking-wide">Session Active</span>
        </div>
      ) : (
        <div className="flex items-center gap-3 mb-8 glass-panel rounded-full px-6 py-3 border-yellow-500/30 bg-yellow-500/10">
          <span className="h-3 w-3 rounded-full bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.5)] animate-pulse" />
          <span className="text-yellow-200 text-sm font-medium">
            Waiting for tutor to join the session…
          </span>
        </div>
      )}

      {/* Session controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleMute}
          className={`rounded-xl border px-6 py-3 text-sm font-semibold transition-all ${
            isMuted
              ? "bg-brand-red/20 border-brand-red text-white shadow-lg shadow-brand-red/20"
              : "bg-slate-800/80 border-slate-700 text-white hover:bg-slate-700 hover:border-slate-600"
          }`}
          data-testid="mute-toggle"
          title={isMuted ? "Unmute microphone" : "Mute microphone"}
        >
          {isMuted ? "Unmute" : "Mute"}
        </button>

        {/* Leave session button — disconnects without ending the session */}
        <button
          onClick={onLeave}
          className="rounded-xl bg-slate-800/80 border border-slate-700 px-8 py-3 text-sm font-semibold text-white hover:bg-brand-red hover:border-brand-red hover:shadow-lg hover:shadow-brand-red/20 transition-all"
        >
          Leave Session
        </button>
      </div>

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
