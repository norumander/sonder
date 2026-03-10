interface SessionEndedScreenProps {
  reason: string | null;
  /** Optional session ID for the "View Analytics" link (tutor only). */
  sessionId?: string;
  /** Optional callback to navigate to analytics. */
  onViewAnalytics?: () => void;
}

const REASON_MESSAGES: Record<string, string> = {
  tutor_ended: "The tutor ended the session.",
};

/**
 * Full-screen message shown when a session has ended.
 * Displayed to both tutor and student.
 */
export function SessionEndedScreen({ reason, sessionId, onViewAnalytics }: SessionEndedScreenProps) {
  const message = reason ? REASON_MESSAGES[reason] ?? "The session has ended." : "The session has ended.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center max-w-md p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Session Ended</h1>
        <p className="text-gray-600 mb-6">{message}</p>
        {(sessionId || onViewAnalytics) && (
          <a
            href={sessionId ? `/analytics/${sessionId}` : "#"}
            onClick={(e) => {
              if (onViewAnalytics) {
                e.preventDefault();
                onViewAnalytics();
              }
            }}
            className="inline-block rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
            data-testid="view-analytics"
          >
            View Session Analytics
          </a>
        )}
      </div>
    </div>
  );
}
