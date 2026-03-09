/**
 * A single metric display card with value, trend arrow, and color-coded status.
 */

import type { MetricStatus, TrendDirection } from "../shared/types";

interface MetricCardProps {
  /** Display label for the metric. */
  label: string;
  /** Formatted value string (e.g. "85%", "3", "--"). */
  value: string;
  /** Color-coded health status. */
  status: MetricStatus;
  /** Trend direction over last 2 minutes. */
  trend?: TrendDirection;
}

const STATUS_COLORS: Record<MetricStatus, string> = {
  green: "bg-green-50 border-green-200 text-green-800",
  yellow: "bg-yellow-50 border-yellow-200 text-yellow-800",
  red: "bg-red-50 border-red-200 text-red-800",
};

const STATUS_VALUE_COLORS: Record<MetricStatus, string> = {
  green: "text-green-700",
  yellow: "text-yellow-700",
  red: "text-red-700",
};

const TREND_ICONS: Record<TrendDirection, string> = {
  improving: "\u2191",
  declining: "\u2193",
  stable: "\u2192",
};

const TREND_COLORS: Record<TrendDirection, string> = {
  improving: "text-green-600",
  declining: "text-red-600",
  stable: "text-gray-400",
};

export function MetricCard({ label, value, status, trend }: MetricCardProps) {
  return (
    <div
      className={`rounded-lg border p-3 ${STATUS_COLORS[status]}`}
      data-testid={`metric-card-${label.toLowerCase().replace(/\s+/g, "-")}`}
      data-status={status}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide opacity-75">
          {label}
        </span>
        {trend && (
          <span
            className={`text-sm font-bold ${TREND_COLORS[trend]}`}
            data-testid="trend-arrow"
            title={trend}
          >
            {TREND_ICONS[trend]}
          </span>
        )}
      </div>
      <div className={`mt-1 text-2xl font-bold ${STATUS_VALUE_COLORS[status]}`}>
        {value}
      </div>
    </div>
  );
}
