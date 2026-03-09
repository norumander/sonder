import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useFaceMesh } from "./useFaceMesh";

// Mock the @mediapipe/tasks-vision module
const { mockDetect, mockClose, mockCreateFromOptions } = vi.hoisted(() => {
  const detect = vi.fn();
  const close = vi.fn();
  const createFromOptions = vi.fn();
  return { mockDetect: detect, mockClose: close, mockCreateFromOptions: createFromOptions };
});

vi.mock("@mediapipe/tasks-vision", () => ({
  FaceLandmarker: {
    createFromOptions: mockCreateFromOptions,
  },
  FilesetResolver: {
    forVisionTasks: vi.fn().mockResolvedValue({}),
  },
}));

function makeMockLandmarks() {
  return Array.from({ length: 478 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
  }));
}

function createMockVideo(): HTMLVideoElement {
  const mockVideo = document.createElement("video");
  Object.defineProperty(mockVideo, "readyState", { value: 4 });
  Object.defineProperty(mockVideo, "videoWidth", { value: 640 });
  return mockVideo;
}

describe("useFaceMesh", () => {
  beforeEach(() => {
    mockDetect.mockReset();
    mockClose.mockReset();
    mockCreateFromOptions.mockReset();
    mockCreateFromOptions.mockResolvedValue({
      detect: mockDetect,
      close: mockClose,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null metrics when no video stream provided", () => {
    const { result } = renderHook(() => useFaceMesh(null));

    expect(result.current.eyeContactScore).toBeNull();
    expect(result.current.facialEnergy).toBeNull();
    expect(result.current.faceDetected).toBe(false);
  });

  it("returns null metrics when face not detected", async () => {
    const mockVideo = createMockVideo();
    mockDetect.mockReturnValue({ faceLandmarks: [] });

    const { result } = renderHook(() => useFaceMesh(mockVideo));

    await waitFor(() => {
      expect(mockDetect).toHaveBeenCalled();
    });

    expect(result.current.faceDetected).toBe(false);
    expect(result.current.eyeContactScore).toBeNull();
    expect(result.current.facialEnergy).toBeNull();
  });

  it("computes eye contact score when face detected", async () => {
    const mockVideo = createMockVideo();

    const landmarks = makeMockLandmarks();
    // Set up centered iris for high eye contact
    landmarks[33] = { x: 0.35, y: 0.4, z: 0 };
    landmarks[133] = { x: 0.45, y: 0.4, z: 0 };
    landmarks[159] = { x: 0.4, y: 0.37, z: 0 };
    landmarks[145] = { x: 0.4, y: 0.43, z: 0 };
    landmarks[362] = { x: 0.55, y: 0.4, z: 0 };
    landmarks[263] = { x: 0.65, y: 0.4, z: 0 };
    landmarks[386] = { x: 0.6, y: 0.37, z: 0 };
    landmarks[374] = { x: 0.6, y: 0.43, z: 0 };
    landmarks[468] = { x: 0.4, y: 0.4, z: 0 };
    landmarks[473] = { x: 0.6, y: 0.4, z: 0 };

    mockDetect.mockReturnValue({ faceLandmarks: [landmarks] });

    const { result } = renderHook(() => useFaceMesh(mockVideo));

    await waitFor(() => {
      expect(result.current.faceDetected).toBe(true);
    });

    expect(result.current.eyeContactScore).toBeGreaterThanOrEqual(0.8);
  });

  it("cleans up face landmarker on unmount", async () => {
    const mockVideo = createMockVideo();
    mockDetect.mockReturnValue({ faceLandmarks: [] });

    const { unmount } = renderHook(() => useFaceMesh(mockVideo));

    // Wait for initialization to complete
    await waitFor(() => {
      expect(mockDetect).toHaveBeenCalled();
    });

    act(() => {
      unmount();
    });

    expect(mockClose).toHaveBeenCalled();
  });
});
