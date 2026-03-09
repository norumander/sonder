import { useState, useEffect, useRef, useCallback } from "react";

export type MediaCaptureStatus = "idle" | "requesting" | "active" | "error";

export interface AudioChunk {
  /** Base64-encoded 16-bit PCM data */
  data: string;
  /** Timestamp in ms since session start */
  timestamp: number;
}

export interface MediaCaptureState {
  videoStream: MediaStream | null;
  status: MediaCaptureStatus;
  error: string | null;
  micAvailable: boolean;
  audioChunks: AudioChunk[];
  /** Clear the audio chunks buffer after reading */
  consumeAudioChunks: () => AudioChunk[];
}

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  sampleRate: 16000,
  channelCount: 1,
  echoCancellation: true,
};

const CHUNK_DURATION_MS = 1000;

/**
 * Hook that captures webcam video and microphone audio via getUserMedia.
 * Audio is chunked into 1-second base64 PCM segments.
 *
 * - Webcam denied → error state, session cannot start.
 * - Mic denied → video-only mode with micAvailable=false.
 * - Cleanup releases all media streams on unmount.
 */
export function useMediaCapture(): MediaCaptureState {
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<MediaCaptureStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [micAvailable, setMicAvailable] = useState(true);
  const [audioChunks, setAudioChunks] = useState<AudioChunk[]>([]);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const pcmBufferRef = useRef<Float32Array[]>([]);
  const startTimeRef = useRef<number>(0);
  const lastChunkTimeRef = useRef<number>(0);

  const consumeAudioChunks = useCallback((): AudioChunk[] => {
    const chunks = [...audioChunks];
    setAudioChunks([]);
    return chunks;
  }, [audioChunks]);

  useEffect(() => {
    let cancelled = false;

    async function startCapture() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setError("Media capture is not supported in this browser");
        return;
      }

      setStatus("requesting");

      let stream: MediaStream;

      try {
        // Try video + audio first
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: AUDIO_CONSTRAINTS,
        });
      } catch (err) {
        // If both fail, try video-only (mic denied)
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          setMicAvailable(false);
          streamRef.current = stream;
          setVideoStream(stream);
          setStatus("active");
          return;
        } catch {
          // Both failed — camera denied
          if (!cancelled) {
            setStatus("error");
            setError(
              "Camera access denied. Please allow camera access to start a session.",
            );
          }
          return;
        }
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      setVideoStream(stream);
      setStatus("active");
      startTimeRef.current = Date.now();
      lastChunkTimeRef.current = Date.now();

      // Set up audio chunking if audio tracks exist
      if (stream.getAudioTracks().length > 0) {
        setupAudioChunking(stream);
      } else {
        setMicAvailable(false);
      }
    }

    function setupAudioChunking(stream: MediaStream) {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Buffer size 4096 at 16kHz ≈ 256ms per callback
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event: AudioProcessingEvent) => {
        if (cancelled) return;
        const inputData = event.inputBuffer.getChannelData(0);
        pcmBufferRef.current.push(new Float32Array(inputData));

        const now = Date.now();
        if (now - lastChunkTimeRef.current >= CHUNK_DURATION_MS) {
          flushChunk(now);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
    }

    function flushChunk(now: number) {
      const buffer = pcmBufferRef.current;
      if (buffer.length === 0) return;

      // Concatenate all buffered Float32Arrays
      const totalLength = buffer.reduce((sum, arr) => sum + arr.length, 0);
      const combined = new Float32Array(totalLength);
      let offset = 0;
      for (const arr of buffer) {
        combined.set(arr, offset);
        offset += arr.length;
      }
      pcmBufferRef.current = [];

      // Convert float32 [-1, 1] to int16
      const int16 = new Int16Array(combined.length);
      for (let i = 0; i < combined.length; i++) {
        const s = Math.max(-1, Math.min(1, combined[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      // Base64 encode
      const bytes = new Uint8Array(int16.buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      const chunk: AudioChunk = {
        data: base64,
        timestamp: now - startTimeRef.current,
      };

      setAudioChunks((prev) => [...prev, chunk]);
      lastChunkTimeRef.current = now;
    }

    startCapture();

    return () => {
      cancelled = true;

      // Disconnect audio processing
      processorRef.current?.disconnect();
      sourceRef.current?.disconnect();
      audioContextRef.current?.close();

      // Stop all media tracks
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    videoStream,
    status,
    error,
    micAvailable,
    audioChunks,
    consumeAudioChunks,
  };
}
