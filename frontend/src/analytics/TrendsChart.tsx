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
      <div>
        <h4 className="mb-2 text-sm font-semibold text-gray-600">Eye Contact (avg)</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="tutor_eye_contact"
              stroke="#3b82f6"
              name="Tutor"
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="student_eye_contact"
              stroke="#f97316"
              name="Student"
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Energy Trends */}
      <div>
        <h4 className="mb-2 text-sm font-semibold text-gray-600">Energy (avg)</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="tutor_energy"
              stroke="#3b82f6"
              name="Tutor"
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="student_energy"
              stroke="#f97316"
              name="Student"
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Talk Time Trends */}
      <div>
        <h4 className="mb-2 text-sm font-semibold text-gray-600">Talk Time %</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="tutor_talk_pct"
              stroke="#3b82f6"
              name="Tutor"
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="student_talk_pct"
              stroke="#f97316"
              name="Student"
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Engagement Score Trend */}
      <div>
        <h4 className="mb-2 text-sm font-semibold text-gray-600">Engagement Score</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="engagement_score"
              stroke="#10b981"
              name="Overall"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
