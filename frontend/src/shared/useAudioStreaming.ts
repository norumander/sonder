import { useCallback } from "react";
import type { AudioChunk } from "../media/useMediaCapture";
import { useWebSocketReady } from "./useWebSocketReady";

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
  const isStreaming = useWebSocketReady(ws);

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
