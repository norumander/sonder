import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { AnalyticsListPage, AnalyticsDetailPage } from "./analytics/AnalyticsPage";
import { TrendsPage } from "./analytics/TrendsPage";
import { UploadForm } from "./sessions/UploadForm";

/**
 * Root application component with client-side routing.
 *
 * Token is placeholder — will be wired to auth module.
 */
function App() {
  // TODO: Replace with real auth token from useAuth() hook once auth UI is wired
  const token = "";

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <header className="border-b bg-white px-6 py-4">
          <h1 className="text-xl font-bold text-gray-800">Sonder</h1>
        </header>
        <Routes>
          <Route path="/upload" element={<UploadPage token={token} />} />
          <Route path="/analytics" element={<AnalyticsListPage token={token} />} />
          <Route path="/analytics/:sessionId" element={<AnalyticsDetailPage token={token} />} />
          <Route path="/trends" element={<TrendsPage token={token} />} />
          <Route path="*" element={<Navigate to="/analytics" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

/**
 * Page wrapper for pre-recorded video upload.
 * Navigates to analytics detail on successful upload.
 */
function UploadPage({ token }: { token: string }) {
  const navigate = useNavigate();

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h2 className="mb-6 text-lg font-semibold text-gray-800">
        Analyze Pre-Recorded Session
      </h2>
      <UploadForm
        token={token}
        onUploadComplete={(sessionId) => navigate(`/analytics/${sessionId}`)}
      />
    </main>
  );
}

export default App;
