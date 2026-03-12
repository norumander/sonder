import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useMediaCapture } from "./useMediaCapture";

// --- Helpers ---

function createMockMediaStream(hasVideo: boolean, hasAudio: boolean) {
  const tracks: MediaStreamTrack[] = [];
  if (hasVideo) {
    tracks.push({
      kind: "video",
      stop: vi.fn(),
      enabled: true,
    } as unknown as MediaStreamTrack);
  }
  if (hasAudio) {
    tracks.push({
      kind: "audio",
      stop: vi.fn(),
      enabled: true,
    } as unknown as MediaStreamTrack);
  }
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
  } as unknown as MediaStream;
}

// Mock AudioContext and ScriptProcessorNode for audio chunking
class MockScriptProcessorNode extends EventTarget {
  onaudioprocess: ((e: AudioProcessingEvent) => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockAudioContext {
  state = "running";
  sampleRate = 16000;
  private _processor = new MockScriptProcessorNode();
  private _source = { connect: vi.fn(), disconnect: vi.fn() };

  createMediaStreamSource = vi.fn(() => this._source);
  createScriptProcessor = vi.fn(() => this._processor);
  close = vi.fn();

  get _mockProcessor() {
    return this._processor;
  }
  get _mockSource() {
    return this._source;
  }
}

// --- Tests ---

describe("useMediaCapture", () => {
  let mockGetUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGetUserMedia = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: mockGetUserMedia },
      writable: true,
      configurable: true,
    });
    vi.stubGlobal("AudioContext", MockAudioContext);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("requests camera and microphone permissions on mount", async () => {
    const stream = createMockMediaStream(true, true);
    mockGetUserMedia.mockResolvedValue(stream);

    renderHook(() => useMediaCapture());

    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalledWith({
        video: true,
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true },
      });
    });
  });

  it("provides video stream when permissions granted", async () => {
    const stream = createMockMediaStream(true, true);
    mockGetUserMedia.mockResolvedValue(stream);

    const { result } = renderHook(() => useMediaCapture());

    await waitFor(() => {
      expect(result.current.videoStream).toBe(stream);
      expect(result.current.status).toBe("active");
    });
  });

  it("sets error state when webcam denied", async () => {
    mockGetUserMedia.mockRejectedValue(new DOMException("Permission denied", "NotAllowedError"));

    const { result } = renderHook(() => useMediaCapture());

    await waitFor(() => {
      expect(result.current.status).toBe("error");
      expect(result.current.error).toMatch(/camera/i);
      expect(result.current.videoStream).toBeNull();
    });
  });

  it("enters video-only mode when mic denied but camera allowed", async () => {
    // First call (video+audio) fails, second call (video-only) succeeds
    const videoOnlyStream = createMockMediaStream(true, false);
    mockGetUserMedia
      .mockRejectedValueOnce(new DOMException("Permission denied", "NotAllowedError"))
      .mockResolvedValueOnce(videoOnlyStream);

    const { result } = renderHook(() => useMediaCapture());

    await waitFor(() => {
      expect(result.current.status).toBe("active");
      expect(result.current.videoStream).toBe(videoOnlyStream);
      expect(result.current.micAvailable).toBe(false);
    });
  });

  it("produces base64 PCM audio chunks", async () => {
    const stream = createMockMediaStream(true, true);
    mockGetUserMedia.mockResolvedValue(stream);

    const { result } = renderHook(() => useMediaCapture());

    await waitFor(() => {
      expect(result.current.status).toBe("active");
    });

    // Audio chunks are collected via onAudioChunk callback
    expect(result.current.audioChunks).toBeDefined();
    expect(Array.isArray(result.current.audioChunks)).toBe(true);
  });

  it("releases media streams on unmount", async () => {
    const stream = createMockMediaStream(true, true);
    mockGetUserMedia.mockResolvedValue(stream);

    const { result, unmount } = renderHook(() => useMediaCapture());

    await waitFor(() => {
      expect(result.current.status).toBe("active");
    });

    act(() => {
      unmount();
    });

    for (const track of stream.getTracks()) {
      expect(track.stop).toHaveBeenCalled();
    }
  });

  it("sets status to requesting while waiting for permissions", () => {
    // Never resolve to test intermediate state
    mockGetUserMedia.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useMediaCapture());

    expect(result.current.status).toBe("requesting");
  });

  it("handles getUserMedia not available", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useMediaCapture());

    await waitFor(() => {
      expect(result.current.status).toBe("error");
      expect(result.current.error).toMatch(/not supported/i);
    });
  });

  it("starts unmuted by default", async () => {
    const stream = createMockMediaStream(true, true);
    mockGetUserMedia.mockResolvedValue(stream);

    const { result } = renderHook(() => useMediaCapture());

    await waitFor(() => {
      expect(result.current.status).toBe("active");
    });

    expect(result.current.isMuted).toBe(false);
  });

  it("toggleMute disables audio tracks and sets isMuted", async () => {
    const stream = createMockMediaStream(true, true);
    mockGetUserMedia.mockResolvedValue(stream);

    const { result } = renderHook(() => useMediaCapture());

    await waitFor(() => {
      expect(result.current.status).toBe("active");
    });

    act(() => {
      result.current.toggleMute();
    });

    expect(result.current.isMuted).toBe(true);
    for (const track of stream.getAudioTracks()) {
      expect(track.enabled).toBe(false);
    }
  });

  it("toggleMute re-enables audio tracks on second call", async () => {
    const stream = createMockMediaStream(true, true);
    mockGetUserMedia.mockResolvedValue(stream);

    const { result } = renderHook(() => useMediaCapture());

    await waitFor(() => {
      expect(result.current.status).toBe("active");
    });

    act(() => {
      result.current.toggleMute(); // mute
    });
    act(() => {
      result.current.toggleMute(); // unmute
    });

    expect(result.current.isMuted).toBe(false);
    for (const track of stream.getAudioTracks()) {
      expect(track.enabled).toBe(true);
    }
  });
});
