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
  green: "bg-brand-teal/5 border-brand-teal/30 text-brand-teal shadow-[inset_0_0_10px_rgba(45,212,191,0.05)]",
  yellow: "bg-yellow-500/5 border-yellow-500/30 text-yellow-400 shadow-[inset_0_0_10px_rgba(250,204,21,0.05)]",
  red: "bg-brand-red/5 border-brand-red/30 text-brand-red shadow-[inset_0_0_10px_rgba(244,63,94,0.05)]",
};

const STATUS_VALUE_COLORS: Record<MetricStatus, string> = {
  green: "text-white",
  yellow: "text-white",
  red: "text-white",
};

const TREND_ICONS: Record<TrendDirection, string> = {
  improving: "\u2191",
  declining: "\u2193",
  stable: "\u2192",
};

const TREND_COLORS: Record<TrendDirection, string> = {
  improving: "text-brand-teal",
  declining: "text-brand-red",
  stable: "text-slate-500",
};

export function MetricCard({ label, value, status, trend }: MetricCardProps) {
  return (
    <div
      className={`rounded-xl border p-4 backdrop-blur-sm transition-all hover:scale-[1.02] ${STATUS_COLORS[status]}`}
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
