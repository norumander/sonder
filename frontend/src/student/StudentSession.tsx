import { useRef, useEffect } from "react";
import { useMediaCapture } from "../media/useMediaCapture";
import { useFaceMesh } from "../metrics/useFaceMesh";
import { useMetricsStreaming } from "../shared/useMetricsStreaming";
import { useAudioStreaming } from "../shared/useAudioStreaming";
import { useSessionLifecycle } from "../sessions/useSessionLifecycle";
import { SessionEndedScreen } from "../sessions/SessionEndedScreen";

interface StudentSessionProps {
  sessionId: string;
  token: string;
  ws: WebSocket | null;
}

/**
 * Student's session view. Shows webcam preview, "Session active" indicator,
 * and "Leave session" button. No metrics, charts, or nudges are displayed.
 *
 * Streams face metrics and audio to the server via WebSocket.
 */
export function StudentSession({ sessionId, token, ws }: StudentSessionProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { videoStream, status, error, consumeAudioChunks } = useMediaCapture();
  const { eyeContactScore, facialEnergy } = useFaceMesh(videoRef.current);
  const { sessionEnded, endReason, endSession } = useSessionLifecycle(sessionId, token, ws);

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
    if (videoRef.current && videoStream) {
      videoRef.current.srcObject = videoStream;
    }
  }, [videoStream]);

  if (sessionEnded) {
    return <SessionEndedScreen reason={endReason} />;
  }

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
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full"
        />
      </div>

      {/* Session active indicator */}
      <div className="flex items-center gap-2 mb-6">
        <span className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
        <span className="text-white text-sm font-medium">Session Active</span>
      </div>

      {/* Leave session button */}
      <button
        onClick={endSession}
        className="rounded-md bg-red-600 px-6 py-2 text-sm font-medium text-white hover:bg-red-700"
      >
        Leave Session
      </button>
    </div>
  );
}
