import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAudioStreaming } from "./useAudioStreaming";
import type { AudioChunk } from "../media/useMediaCapture";

function createMockWebSocket(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as WebSocket;
}

describe("useAudioStreaming", () => {
  let mockWs: WebSocket;

  beforeEach(() => {
    mockWs = createMockWebSocket();
  });

  it("sends audio chunks as JSON over WebSocket", () => {
    const { result } = renderHook(() => useAudioStreaming(mockWs));

    const chunks: AudioChunk[] = [
      { data: "dGVzdA==", timestamp: 1000 },
    ];

    act(() => {
      result.current.sendAudioChunks(chunks);
    });

    expect(mockWs.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse((mockWs.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(sent.type).toBe("audio_chunk");
    expect(sent.data).toBe("dGVzdA==");
    expect(sent.timestamp).toBe(1000);
  });

  it("sends multiple chunks individually", () => {
    const { result } = renderHook(() => useAudioStreaming(mockWs));

    const chunks: AudioChunk[] = [
      { data: "Y2h1bmsx", timestamp: 1000 },
      { data: "Y2h1bmsz", timestamp: 2000 },
    ];

    act(() => {
      result.current.sendAudioChunks(chunks);
    });

    expect(mockWs.send).toHaveBeenCalledTimes(2);
  });

  it("does not send when WebSocket is not open", () => {
    const closedWs = {
      ...mockWs,
      readyState: WebSocket.CLOSED,
    } as unknown as WebSocket;

    const { result } = renderHook(() => useAudioStreaming(closedWs));

    act(() => {
      result.current.sendAudioChunks([{ data: "dGVzdA==", timestamp: 1000 }]);
    });

    expect(closedWs.send).not.toHaveBeenCalled();
  });

  it("does not send when WebSocket is null", () => {
    const { result } = renderHook(() => useAudioStreaming(null));

    // Should not throw
    act(() => {
      result.current.sendAudioChunks([{ data: "dGVzdA==", timestamp: 1000 }]);
    });
  });

  it("tracks streaming state", () => {
    const { result } = renderHook(() => useAudioStreaming(mockWs));
    expect(result.current.isStreaming).toBe(true);

    const { result: nullResult } = renderHook(() => useAudioStreaming(null));
    expect(nullResult.current.isStreaming).toBe(false);
  });
});
