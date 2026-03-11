/**
 * Cross-session trend charts showing metric averages across the last 10 sessions.
 * Tutor and student as separate series, with an empty-state for <2 sessions.
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
import type { TrendDataPoint } from "./types";

interface TrendsChartProps {
  sessions: TrendDataPoint[];
}

interface ChartDataPoint {
  label: string;
  tutor_eye_contact: number | null;
  student_eye_contact: number | null;
  tutor_energy: number | null;
  student_energy: number | null;
  tutor_talk_pct: number | null;
  student_talk_pct: number | null;
  engagement_score: number;
  total_interruptions: number;
}

function formatSessionLabel(startTime: string | null, index: number): string {
  if (!startTime) return `#${index + 1}`;
  const d = new Date(startTime);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Transform raw trend data into chart data points.
 */
export function toTrendChartData(sessions: TrendDataPoint[]): ChartDataPoint[] {
  return sessions.map((s, i) => ({
    label: formatSessionLabel(s.start_time, i),
    tutor_eye_contact: s.tutor_eye_contact,
    student_eye_contact: s.student_eye_contact,
    tutor_energy: s.tutor_energy,
    student_energy: s.student_energy,
    tutor_talk_pct: s.tutor_talk_pct,
    student_talk_pct: s.student_talk_pct,
    engagement_score: s.engagement_score,
    total_interruptions: s.total_interruptions,
  }));
}

export function TrendsChart({ sessions }: TrendsChartProps) {
  if (sessions.length < 2) {
    return (
      <div className="p-12 text-center text-gray-400" data-testid="trends-empty">
        Complete more sessions to see trends. At least 2 sessions are needed.
      </div>
    );
  }

  const data = toTrendChartData(sessions);

  return (
    <div className="space-y-6" data-testid="trends-chart">
      {/* Eye Contact Trends */}
      <div className="glass-panel p-5 rounded-xl border-slate-700/50 shadow-lg shadow-black/20">
        <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-300">Eye Contact (avg)</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} stroke="#475569" />
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
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="student_eye_contact"
              stroke="#2dd4bf" // brand-teal
              strokeWidth={3}
              name="Student"
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Energy Trends */}
      <div className="glass-panel p-5 rounded-xl border-slate-700/50 shadow-lg shadow-black/20">
        <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-300">Energy (avg)</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} stroke="#475569" />
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
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="student_energy"
              stroke="#2dd4bf"
              strokeWidth={3}
              name="Student"
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Talk Time Trends */}
      <div className="glass-panel p-5 rounded-xl border-slate-700/50 shadow-lg shadow-black/20">
        <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-300">Talk Time %</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} stroke="#475569" />
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
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="student_talk_pct"
              stroke="#2dd4bf"
              strokeWidth={3}
              name="Student"
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Engagement Score Trend */}
      <div className="glass-panel p-5 rounded-xl border-slate-700/50 shadow-lg shadow-black/20">
        <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-300">Engagement Score</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} stroke="#475569" />
            <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} stroke="#475569" />
            <Tooltip
              contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", color: "#f8fafc", borderRadius: "0.5rem" }}
              itemStyle={{ color: "#e2e8f0" }}
            />
            <Legend wrapperStyle={{ paddingTop: "10px" }} />
            <Line
              type="monotone"
              dataKey="engagement_score"
              stroke="#a855f7" // brand-purple
              strokeWidth={3}
              name="Overall"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
