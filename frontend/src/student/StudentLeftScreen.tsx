interface StudentLeftScreenProps {
  onRejoin: () => void;
}

/**
 * Shown after a student voluntarily leaves an ongoing session.
 * Offers a Rejoin button to reconnect.
 */
export function StudentLeftScreen({ onRejoin }: StudentLeftScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center max-w-md p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          You left the session
        </h1>
        <p className="text-gray-600 mb-6">
          The session is still in progress. You can rejoin at any time.
        </p>
        <button
          onClick={onRejoin}
          className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Rejoin Session
        </button>
      </div>
    </div>
  );
}
