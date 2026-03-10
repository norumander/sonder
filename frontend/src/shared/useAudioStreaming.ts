import { useCallback, useEffect, useState } from "react";
import type { AudioChunk } from "../media/useMediaCapture";

export interface AudioStreamingState {
  /** Send buffered audio chunks over the WebSocket connection. */
  sendAudioChunks: (chunks: AudioChunk[]) => void;
  /** Whether the WebSocket is open and ready to stream. */
  isStreaming: boolean;
}

/**
 * Hook that sends audio chunks from useMediaCapture over a WebSocket connection.
 *
 * Each chunk is sent as a JSON message:
 * `{ type: "audio_chunk", data: "<base64 PCM>", timestamp: <ms> }`
 *
 * @param ws The WebSocket connection, or null if not connected.
 */
export function useAudioStreaming(ws: WebSocket | null): AudioStreamingState {
  const [isStreaming, setIsStreaming] = useState(
    () => ws !== null && ws.readyState === WebSocket.OPEN,
  );

  useEffect(() => {
    if (!ws) {
      setIsStreaming(false);
      return;
    }

    const handleOpen = () => setIsStreaming(true);
    const handleClose = () => setIsStreaming(false);

    // Check current state
    setIsStreaming(ws.readyState === WebSocket.OPEN);

    ws.addEventListener("open", handleOpen);
    ws.addEventListener("close", handleClose);
    ws.addEventListener("error", handleClose);
    return () => {
      ws.removeEventListener("open", handleOpen);
      ws.removeEventListener("close", handleClose);
      ws.removeEventListener("error", handleClose);
    };
  }, [ws]);

  const sendAudioChunks = useCallback(
    (chunks: AudioChunk[]) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      for (const chunk of chunks) {
        ws.send(
          JSON.stringify({
            type: "audio_chunk",
            data: chunk.data,
            timestamp: chunk.timestamp,
          }),
        );
      }
    },
    [ws],
  );

  return { sendAudioChunks, isStreaming };
}
