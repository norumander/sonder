import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UploadForm } from "./UploadForm";

const API_BASE = "http://localhost:8000";

describe("UploadForm", () => {
  let onUploadComplete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onUploadComplete = vi.fn();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders two file inputs, offset, and speed selector", () => {
    render(<UploadForm token="test-token" onUploadComplete={onUploadComplete} />);

    expect(screen.getByLabelText(/tutor video/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/student video/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/timestamp offset/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/processing speed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload/i })).toBeInTheDocument();
  });

  it("requires both video files", async () => {
    render(<UploadForm token="test-token" onUploadComplete={onUploadComplete} />);

    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    expect(screen.getByText(/both video files are required/i)).toBeInTheDocument();
    expect(onUploadComplete).not.toHaveBeenCalled();
  });

  it("accepts mp4 and webm file types", () => {
    render(<UploadForm token="test-token" onUploadComplete={onUploadComplete} />);

    const tutorInput = screen.getByLabelText(/tutor video/i);
    const studentInput = screen.getByLabelText(/student video/i);

    expect(tutorInput).toHaveAttribute("accept", ".mp4,.webm");
    expect(studentInput).toHaveAttribute("accept", ".mp4,.webm");
  });

  it("calls upload endpoint with FormData on submit", async () => {
    const mockResponse = {
      session_id: "sess-123",
      session_type: "pre_recorded",
      status: "processing",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }),
    );

    render(<UploadForm token="test-token" onUploadComplete={onUploadComplete} />);

    // Simulate file selection
    const tutorFile = new File(["tutor-video"], "tutor.mp4", { type: "video/mp4" });
    const studentFile = new File(["student-video"], "student.mp4", { type: "video/mp4" });

    fireEvent.change(screen.getByLabelText(/tutor video/i), {
      target: { files: [tutorFile] },
    });
    fireEvent.change(screen.getByLabelText(/student video/i), {
      target: { files: [studentFile] },
    });

    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => {
      expect(onUploadComplete).toHaveBeenCalledWith("sess-123");
    });

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE}/sessions/upload`,
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer test-token" },
      }),
    );

    // Verify FormData was sent (body should be FormData instance)
    const callArgs = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].body).toBeInstanceOf(FormData);
  });

  it("shows error on upload failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ detail: "Invalid file type" }),
      }),
    );

    render(<UploadForm token="test-token" onUploadComplete={onUploadComplete} />);

    const tutorFile = new File(["tutor"], "tutor.mp4", { type: "video/mp4" });
    const studentFile = new File(["student"], "student.mp4", { type: "video/mp4" });

    fireEvent.change(screen.getByLabelText(/tutor video/i), {
      target: { files: [tutorFile] },
    });
    fireEvent.change(screen.getByLabelText(/student video/i), {
      target: { files: [studentFile] },
    });

    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid file type/i)).toBeInTheDocument();
    });
    expect(onUploadComplete).not.toHaveBeenCalled();
  });

  it("disables button while uploading", async () => {
    let resolveRequest: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
      ),
    );

    render(<UploadForm token="test-token" onUploadComplete={onUploadComplete} />);

    const tutorFile = new File(["tutor"], "tutor.mp4", { type: "video/mp4" });
    const studentFile = new File(["student"], "student.mp4", { type: "video/mp4" });

    fireEvent.change(screen.getByLabelText(/tutor video/i), {
      target: { files: [tutorFile] },
    });
    fireEvent.change(screen.getByLabelText(/student video/i), {
      target: { files: [studentFile] },
    });

    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    expect(screen.getByRole("button", { name: /uploading/i })).toBeDisabled();

    resolveRequest!({
      ok: true,
      json: () =>
        Promise.resolve({
          session_id: "s1",
          session_type: "pre_recorded",
          status: "processing",
        }),
    });

    await waitFor(() => {
      expect(onUploadComplete).toHaveBeenCalled();
    });
  });

  it("sends speed and offset values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            session_id: "s1",
            session_type: "pre_recorded",
            status: "processing",
          }),
      }),
    );

    render(<UploadForm token="test-token" onUploadComplete={onUploadComplete} />);

    const tutorFile = new File(["tutor"], "tutor.mp4", { type: "video/mp4" });
    const studentFile = new File(["student"], "student.mp4", { type: "video/mp4" });

    fireEvent.change(screen.getByLabelText(/tutor video/i), {
      target: { files: [tutorFile] },
    });
    fireEvent.change(screen.getByLabelText(/student video/i), {
      target: { files: [studentFile] },
    });
    fireEvent.change(screen.getByLabelText(/timestamp offset/i), {
      target: { value: "5000" },
    });
    fireEvent.change(screen.getByLabelText(/processing speed/i), {
      target: { value: "4" },
    });

    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => {
      expect(onUploadComplete).toHaveBeenCalled();
    });

    const callArgs = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const formData = callArgs[1].body as FormData;
    expect(formData.get("timestamp_offset_ms")).toBe("5000");
    expect(formData.get("processing_speed")).toBe("4");
  });
});
