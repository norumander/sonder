interface StudentLeftScreenProps {
  onRejoin: () => void;
}

/**
 * Shown after a student voluntarily leaves an ongoing session.
 * Offers a Rejoin button to reconnect.
 */
export function StudentLeftScreen({ onRejoin }: StudentLeftScreenProps) {
  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center p-4">
      <div className="text-center max-w-sm w-full p-8 glass-panel rounded-2xl">
        <h1 className="text-2xl font-bold text-white mb-3 text-glow">
          You left the session
        </h1>
        <p className="text-slate-400 mb-8">
          The session is still in progress. You can rejoin at any time.
        </p>
        <button
          onClick={onRejoin}
          className="w-full rounded-xl bg-gradient-to-r from-brand-teal to-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-teal/20 hover:shadow-brand-teal/40 transition-all hover:scale-[1.02]"
        >
          Rejoin Session
        </button>
      </div>
    </div>
  );
}
