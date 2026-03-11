/**
 * Debug overlay showing estimated gaze position on a virtual screen.
 *
 * Renders a rectangle representing the screen/camera field of view
 * with a colored dot indicating where the tracker estimates the user is looking.
 * Dot color reflects the current eye contact score (green/yellow/red).
 */

import type { GazePoint } from "./eyeContact";

interface GazeDebugOverlayProps {
  gazePoint: GazePoint | null;
  eyeContactScore: number | null;
  visible: boolean;
}

const OVERLAY_WIDTH = 200;
const OVERLAY_HEIGHT = 130;
const DOT_RADIUS = 8;
const PADDING = 12;

/** Inner area where the dot can move */
const INNER_W = OVERLAY_WIDTH - PADDING * 2 - DOT_RADIUS * 2;
const INNER_H = OVERLAY_HEIGHT - PADDING * 2 - DOT_RADIUS * 2;

function getDotColor(score: number | null): string {
  if (score === null) return "#9ca3af"; // gray
  if (score >= 0.6) return "#22c55e"; // green
  if (score >= 0.3) return "#eab308"; // yellow
  return "#ef4444"; // red
}

export function GazeDebugOverlay({ gazePoint, eyeContactScore, visible }: GazeDebugOverlayProps) {
  if (!visible) return null;

  // Map gaze point from [-1, 1] to pixel position within the inner area
  const dotX = gazePoint
    ? PADDING + DOT_RADIUS + ((gazePoint.x + 1) / 2) * INNER_W
    : OVERLAY_WIDTH / 2;
  const dotY = gazePoint
    ? PADDING + DOT_RADIUS + ((gazePoint.y + 1) / 2) * INNER_H
    : OVERLAY_HEIGHT / 2;

  const color = getDotColor(eyeContactScore);

  return (
    <div
      className="rounded-lg border border-gray-600 bg-gray-800/90 p-1"
      data-testid="gaze-debug-overlay"
    >
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
          Gaze Debug
        </span>
        {eyeContactScore !== null && (
          <span className="text-[10px] font-mono text-gray-400">
            {Math.round(eyeContactScore * 100)}%
          </span>
        )}
      </div>
      <svg
        width={OVERLAY_WIDTH}
        height={OVERLAY_HEIGHT}
        className="rounded"
        data-testid="gaze-debug-svg"
      >
        {/* Screen rectangle */}
        <rect
          x={4}
          y={4}
          width={OVERLAY_WIDTH - 8}
          height={OVERLAY_HEIGHT - 8}
          rx={4}
          fill="#1f2937"
          stroke="#4b5563"
          strokeWidth={1.5}
        />

        {/* Center crosshair */}
        <line
          x1={OVERLAY_WIDTH / 2}
          y1={PADDING}
          x2={OVERLAY_WIDTH / 2}
          y2={OVERLAY_HEIGHT - PADDING}
          stroke="#374151"
          strokeWidth={1}
          strokeDasharray="3,3"
        />
        <line
          x1={PADDING}
          y1={OVERLAY_HEIGHT / 2}
          x2={OVERLAY_WIDTH - PADDING}
          y2={OVERLAY_HEIGHT / 2}
          stroke="#374151"
          strokeWidth={1}
          strokeDasharray="3,3"
        />

        {/* "Good zone" center rectangle — represents where looking at screen is OK */}
        <rect
          x={OVERLAY_WIDTH * 0.25}
          y={OVERLAY_HEIGHT * 0.2}
          width={OVERLAY_WIDTH * 0.5}
          height={OVERLAY_HEIGHT * 0.6}
          rx={3}
          fill="none"
          stroke="#22c55e"
          strokeWidth={1}
          strokeDasharray="4,3"
          opacity={0.4}
        />

        {/* Gaze dot */}
        {gazePoint ? (
          <>
            {/* Glow effect */}
            <circle cx={dotX} cy={dotY} r={DOT_RADIUS + 3} fill={color} opacity={0.2} />
            <circle
              cx={dotX}
              cy={dotY}
              r={DOT_RADIUS}
              fill={color}
              stroke="white"
              strokeWidth={1.5}
              data-testid="gaze-dot"
            />
          </>
        ) : (
          <text
            x={OVERLAY_WIDTH / 2}
            y={OVERLAY_HEIGHT / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#6b7280"
            fontSize={11}
          >
            No face
          </text>
        )}
      </svg>
    </div>
  );
}
