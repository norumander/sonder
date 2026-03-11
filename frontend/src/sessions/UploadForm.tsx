import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "../shared/config";

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
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const pollForCompletion = useCallback(
    (sessionId: string) => {
      setProcessing(true);
      setProgress(0);
      setStatusMessage("Starting...");

      pollingRef.current = setInterval(async () => {
        try {
          const res = await fetch(
            `${API_BASE}/sessions/${sessionId}/progress`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (!res.ok) return;
          const data = await res.json();
          setProgress(data.progress);
          setStatusMessage(data.stage);
          if (data.status === "completed") {
            stopPolling();
            setProcessing(false);
            onUploadComplete(sessionId);
          } else if (data.status === "failed") {
            stopPolling();
            setProcessing(false);
            setError(data.stage || "Processing failed");
          }
        } catch {
          // Keep polling on network errors
        }
      }, 1000);
    },
    [token, onUploadComplete, stopPolling],
  );

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
        try {
          const data = await response.json();
          setError(data.detail || "Upload failed");
        } catch {
          setError(`Upload failed (${response.status})`);
        }
        return;
      }

      const data = await response.json();
      pollForCompletion(data.session_id);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 glass-panel p-8 rounded-2xl max-w-xl mx-auto">
      <div>
        <label
          htmlFor="tutor-video"
          className="block text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wider"
        >
          Tutor Video
        </label>
        <input
          id="tutor-video"
          type="file"
          accept=".mp4,.webm"
          onChange={(e) => setTutorFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-400 file:mr-4 file:rounded-xl file:border-0 file:bg-brand-purple/20 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-brand-purple border border-slate-700/50 rounded-xl bg-slate-900/50 hover:file:bg-brand-purple/30 transition-all cursor-pointer focus:outline-none"
        />
      </div>

      <div>
        <label
          htmlFor="student-video"
          className="block text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wider"
        >
          Student Video
        </label>
        <input
          id="student-video"
          type="file"
          accept=".mp4,.webm"
          onChange={(e) => setStudentFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-400 file:mr-4 file:rounded-xl file:border-0 file:bg-brand-teal/20 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-brand-teal border border-slate-700/50 rounded-xl bg-slate-900/50 hover:file:bg-brand-teal/30 transition-all cursor-pointer focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <label
            htmlFor="timestamp-offset"
            className="block text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wider"
          >
            Timestamp Offset (ms)
          </label>
          <input
            id="timestamp-offset"
            type="number"
            value={offsetMs}
            onChange={(e) => setOffsetMs(e.target.value)}
            min="0"
            className="block w-full rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-2.5 text-sm text-white focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple transition-all"
          />
          <p className="mt-2 text-xs text-slate-500 font-medium">
            Offset to align student video with tutor video
          </p>
        </div>

        <div>
          <label
            htmlFor="processing-speed"
            className="block text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wider"
          >
            Processing Speed
          </label>
          <select
            id="processing-speed"
            value={speed}
            onChange={(e) => setSpeed(e.target.value)}
            className="block w-full rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-2.5 text-sm text-white focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal transition-all"
          >
            <option value="1">1x (highest accuracy)</option>
            <option value="2">2x (balanced)</option>
            <option value="4">4x (fastest)</option>
          </select>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-4 py-3 rounded-xl font-medium">
          {error}
        </p>
      )}

      {processing && (
        <div className="space-y-3 rounded-xl bg-brand-purple/10 border border-brand-purple/20 px-5 py-4">
          <div className="flex items-center justify-between text-sm text-brand-purple font-semibold">
            <span>{statusMessage}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-purple to-brand-teal transition-all duration-300 shadow-[0_0_10px_rgba(45,212,191,0.5)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={uploading || processing}
        className="w-full rounded-xl bg-gradient-to-r from-brand-purple to-brand-teal px-6 py-4 text-sm font-semibold text-white shadow-lg shadow-brand-purple/20 hover:shadow-brand-purple/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02] active:scale-[0.98]"
      >
        {uploading
          ? "Uploading..."
          : processing
            ? "Processing..."
            : "Upload & Analyze"}
      </button>
    </form>
  );
}
