interface SessionEndedScreenProps {
  reason: string | null;
}

const REASON_MESSAGES: Record<string, string> = {
  tutor_ended: "The tutor ended the session.",
  student_disconnect_timeout: "The student disconnected and did not reconnect in time.",
};

/**
 * Full-screen message shown when a session has ended.
 * Displayed to both tutor and student.
 */
export function SessionEndedScreen({ reason }: SessionEndedScreenProps) {
  const message = reason ? REASON_MESSAGES[reason] ?? "The session has ended." : "The session has ended.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center max-w-md p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Session Ended</h1>
        <p className="text-gray-600 mb-6">{message}</p>
      </div>
    </div>
  );
}
