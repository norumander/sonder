/**
 * Main analytics page with session list and detail views.
 * Uses URL state: /analytics shows list, /analytics/:sessionId shows detail.
 */

import { useParams, useNavigate } from "react-router-dom";
import { useSessionList } from "./useSessionList";
import { useSessionDetail } from "./useSessionDetail";
import { SessionList } from "./SessionList";
import { SessionDetail } from "./SessionDetail";

interface AnalyticsPageProps {
  token: string;
}

export function AnalyticsListPage({ token }: AnalyticsPageProps) {
  const { sessions, total, loading, error, page, setPage } = useSessionList(token);
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-4xl p-6" data-testid="analytics-list-page">
      <h2 className="mb-6 text-xl font-bold text-gray-800">Session History</h2>
      <SessionList
        sessions={sessions}
        total={total}
        loading={loading}
        error={error}
        page={page}
        onPageChange={setPage}
        onSelectSession={(id) => navigate(`/analytics/${id}`)}
      />
    </div>
  );
}

export function AnalyticsDetailPage({ token }: AnalyticsPageProps) {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { summary, snapshots, nudges, loading, error } = useSessionDetail(
    sessionId ?? "",
    token,
  );

  return (
    <div className="mx-auto max-w-4xl p-6" data-testid="analytics-detail-page">
      <SessionDetail
        summary={summary}
        snapshots={snapshots}
        nudges={nudges}
        loading={loading}
        error={error}
        onBack={() => navigate("/analytics")}
      />
    </div>
  );
}
