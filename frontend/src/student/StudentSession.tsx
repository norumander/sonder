import { useState, useCallback, useEffect } from "react";
import { useMediaCapture } from "../media/useMediaCapture";
import { useFaceMesh } from "../metrics/useFaceMesh";
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

  const { videoStream, status, error, consumeAudioChunks } = useMediaCapture();
  const { eyeContactScore, facialEnergy } = useFaceMesh(videoEl);

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
    }, 1000);
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
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center max-w-md p-8">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 p-4">
      {/* Webcam preview */}
      <div className="relative w-full max-w-lg rounded-lg overflow-hidden bg-black mb-6">
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
        <div className="flex items-center gap-2 mb-6">
          <span className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
          <span className="text-white text-sm font-medium">Session Active</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-6 rounded-lg bg-gray-800 px-5 py-3">
          <span className="h-3 w-3 rounded-full bg-yellow-400 animate-pulse" />
          <span className="text-yellow-200 text-sm font-medium">
            Waiting for tutor to join the session…
          </span>
        </div>
      )}

      {/* Leave session button — disconnects without ending the session */}
      <button
        onClick={onLeave}
        className="rounded-md bg-red-600 px-6 py-2 text-sm font-medium text-white hover:bg-red-700"
      >
        Leave Session
      </button>
    </div>
  );
}
