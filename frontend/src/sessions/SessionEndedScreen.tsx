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
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center p-4">
      <div className="text-center max-w-sm w-full p-8 glass-panel rounded-2xl shadow-2xl">
        <h1 className="text-2xl font-bold text-white mb-4 text-glow">Session Ended</h1>
        <p className="text-slate-400 mb-8">{message}</p>
        {(sessionId || onViewAnalytics) && (
          <a
            href={sessionId ? `/analytics/${sessionId}` : "#"}
            onClick={(e) => {
              if (onViewAnalytics) {
                e.preventDefault();
                onViewAnalytics();
              }
            }}
            className="inline-block w-full rounded-xl bg-gradient-to-r from-brand-teal to-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-teal/20 hover:shadow-brand-teal/40 transition-all hover:scale-[1.02]"
            data-testid="view-analytics"
          >
            View Session Analytics
          </a>
        )}
      </div>
    </div>
  );
}
