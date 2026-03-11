/**
 * Trends page showing cross-session metric trends for the tutor.
 */

import { useTrends } from "./useTrends";
import { TrendsChart } from "./TrendsChart";

interface TrendsPageProps {
  token: string;
}

export function TrendsPage({ token }: TrendsPageProps) {
  const { sessions, loading, error } = useTrends(token);

  return (
    <div className="mx-auto max-w-4xl p-6" data-testid="trends-page">
      <h2 className="mb-8 text-3xl font-bold text-white text-glow">Session Trends</h2>

      {loading && (
        <div className="flex justify-center p-12 text-slate-400" data-testid="trends-loading">
          Loading trends...
        </div>
      )}

      {error && (
        <div className="p-8 text-center text-red-500 glass-panel rounded-xl mt-4" data-testid="trends-error">
          {error}
        </div>
      )}

      {!loading && !error && <TrendsChart sessions={sessions} />}
    </div>
  );
}
