import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

interface UploadFormProps {
  token: string;
  onUploadComplete: (sessionId: string) => void;
}

/**
 * Form for uploading two pre-recorded video files for analysis.
 *
 * Accepts tutor and student video files (mp4/webm), optional timestamp offset,
 * and processing speed selection. Uploads via multipart form data to the backend.
 */
export function UploadForm({ token, onUploadComplete }: UploadFormProps) {
  const [tutorFile, setTutorFile] = useState<File | null>(null);
  const [studentFile, setStudentFile] = useState<File | null>(null);
  const [offsetMs, setOffsetMs] = useState("0");
  const [speed, setSpeed] = useState("1");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!tutorFile || !studentFile) {
      setError("Both video files are required");
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("tutor_video", tutorFile);
      formData.append("student_video", studentFile);
      formData.append("timestamp_offset_ms", offsetMs);
      formData.append("processing_speed", speed);

      const response = await fetch(`${API_BASE}/sessions/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.detail || "Upload failed");
        return;
      }

      const data = await response.json();
      onUploadComplete(data.session_id);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label
          htmlFor="tutor-video"
          className="block text-sm font-medium text-gray-700"
        >
          Tutor Video
        </label>
        <input
          id="tutor-video"
          type="file"
          accept=".mp4,.webm"
          onChange={(e) => setTutorFile(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
        />
      </div>

      <div>
        <label
          htmlFor="student-video"
          className="block text-sm font-medium text-gray-700"
        >
          Student Video
        </label>
        <input
          id="student-video"
          type="file"
          accept=".mp4,.webm"
          onChange={(e) => setStudentFile(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
        />
      </div>

      <div>
        <label
          htmlFor="timestamp-offset"
          className="block text-sm font-medium text-gray-700"
        >
          Timestamp Offset (ms)
        </label>
        <input
          id="timestamp-offset"
          type="number"
          value={offsetMs}
          onChange={(e) => setOffsetMs(e.target.value)}
          min="0"
          className="mt-1 block w-48 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">
          Offset to align student video with tutor video
        </p>
      </div>

      <div>
        <label
          htmlFor="processing-speed"
          className="block text-sm font-medium text-gray-700"
        >
          Processing Speed
        </label>
        <select
          id="processing-speed"
          value={speed}
          onChange={(e) => setSpeed(e.target.value)}
          className="mt-1 block w-48 rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="1">1x (highest accuracy)</option>
          <option value="2">2x (balanced)</option>
          <option value="4">4x (fastest)</option>
        </select>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={uploading}
        className="rounded bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {uploading ? "Uploading..." : "Upload & Analyze"}
      </button>
    </form>
  );
}
