/**
 * Timeline chart showing engagement metrics over session duration.
 * Displays tutor and student series for eye contact, energy, and talk time.
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { MetricSnapshotData } from "./types";

interface TimelineChartProps {
  snapshots: MetricSnapshotData[];
}

interface ChartDataPoint {
  time: string;
  timestamp_ms: number;
  tutor_eye_contact: number | null;
  student_eye_contact: number | null;
  tutor_energy: number | null;
  student_energy: number | null;
  tutor_talk_pct: number;
  student_talk_pct: number;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Transform raw snapshots into chart data points.
 */
export function toChartData(snapshots: MetricSnapshotData[]): ChartDataPoint[] {
  return snapshots.map((s) => ({
    time: formatTime(s.timestamp_ms),
    timestamp_ms: s.timestamp_ms,
    tutor_eye_contact: s.metrics.tutor_eye_contact,
    student_eye_contact: s.metrics.student_eye_contact,
    tutor_energy: s.metrics.tutor_energy,
    student_energy: s.metrics.student_energy,
    tutor_talk_pct: s.metrics.tutor_talk_pct,
    student_talk_pct: s.metrics.student_talk_pct,
  }));
}

export function TimelineChart({ snapshots }: TimelineChartProps) {
  if (snapshots.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400" data-testid="timeline-empty">
        No metric data available for this session.
      </div>
    );
  }

  const data = toChartData(snapshots);

  return (
    <div className="space-y-6" data-testid="timeline-chart">
      {/* Eye Contact */}
      <div className="glass-panel p-5 rounded-xl border-slate-700/50 shadow-lg shadow-black/20">
        <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-300">Eye Contact</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 11 }} stroke="#475569" />
            <YAxis domain={[0, 1]} tick={{ fill: "#94a3b8", fontSize: 11 }} stroke="#475569" />
            <Tooltip
              contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", color: "#f8fafc", borderRadius: "0.5rem" }}
              itemStyle={{ color: "#e2e8f0" }}
            />
            <Legend wrapperStyle={{ paddingTop: "10px" }} />
            <Line
              type="monotone"
              dataKey="tutor_eye_contact"
              stroke="#3b82f6" // blue
              strokeWidth={3}
              name="Tutor"
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="student_eye_contact"
              stroke="#2dd4bf" // brand-teal
              strokeWidth={3}
              name="Student"
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Energy */}
      <div className="glass-panel p-5 rounded-xl border-slate-700/50 shadow-lg shadow-black/20">
        <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-300">Energy</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 11 }} stroke="#475569" />
            <YAxis domain={[0, 1]} tick={{ fill: "#94a3b8", fontSize: 11 }} stroke="#475569" />
            <Tooltip
              contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", color: "#f8fafc", borderRadius: "0.5rem" }}
              itemStyle={{ color: "#e2e8f0" }}
            />
            <Legend wrapperStyle={{ paddingTop: "10px" }} />
            <Line
              type="monotone"
              dataKey="tutor_energy"
              stroke="#3b82f6"
              strokeWidth={3}
              name="Tutor"
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="student_energy"
              stroke="#2dd4bf"
              strokeWidth={3}
              name="Student"
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Talk Time */}
      <div className="glass-panel p-5 rounded-xl border-slate-700/50 shadow-lg shadow-black/20">
        <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-300">Talk Time %</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 11 }} stroke="#475569" />
            <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} stroke="#475569" />
            <Tooltip
              contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", color: "#f8fafc", borderRadius: "0.5rem" }}
              itemStyle={{ color: "#e2e8f0" }}
            />
            <Legend wrapperStyle={{ paddingTop: "10px" }} />
            <Line
              type="monotone"
              dataKey="tutor_talk_pct"
              stroke="#3b82f6"
              strokeWidth={3}
              name="Tutor"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="student_talk_pct"
              stroke="#2dd4bf"
              strokeWidth={3}
              name="Student"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
