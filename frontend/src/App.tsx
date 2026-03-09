import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AnalyticsListPage, AnalyticsDetailPage } from "./analytics/AnalyticsPage";

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
          <Route path="/analytics" element={<AnalyticsListPage token={token} />} />
          <Route path="/analytics/:sessionId" element={<AnalyticsDetailPage token={token} />} />
          <Route path="*" element={<Navigate to="/analytics" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
