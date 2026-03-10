/**
 * Root application component with routing, authentication, and navigation.
 */

import { useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  NavLink,
  Outlet,
  useNavigate,
  useParams,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/useAuth";
import { LoginPage } from "./auth/LoginPage";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { CreateSessionPage } from "./sessions/CreateSessionPage";
import { UploadForm } from "./sessions/UploadForm";
import { AnalyticsListPage, AnalyticsDetailPage } from "./analytics/AnalyticsPage";
import { TrendsPage } from "./analytics/TrendsPage";
import { NudgeSettings } from "./settings/NudgeSettings";
import { usePreferences } from "./settings/usePreferences";
import { StudentJoinPage } from "./student/StudentJoinPage";
import { StudentSession } from "./student/StudentSession";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/join" element={<StudentFlow />} />
          <Route path="/join/:code" element={<StudentFlow />} />

          {/* Protected routes with nav bar */}
          <Route element={<ProtectedRoute />}>
            <Route element={<NavLayout />}>
              <Route index element={<Navigate to="/sessions/new" replace />} />
              <Route path="/sessions/new" element={<CreateSessionPage />} />
              <Route path="/session/:sessionId" element={<TutorSessionPlaceholder />} />
              <Route path="/analytics" element={<AuthAnalyticsList />} />
              <Route path="/analytics/:sessionId" element={<AuthAnalyticsDetail />} />
              <Route path="/trends" element={<AuthTrends />} />
              <Route path="/upload" element={<AuthUpload />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/sessions/new" replace />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

// --- Layout ---

function NavLayout() {
  const { tutor, logout } = useAuth();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium ${isActive ? "text-blue-600" : "text-gray-600 hover:text-gray-900"}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <NavLink to="/" className="text-xl font-bold text-gray-800">
            Sonder
          </NavLink>
          <div className="flex gap-4">
            <NavLink to="/sessions/new" className={linkClass}>
              New Session
            </NavLink>
            <NavLink to="/analytics" className={linkClass}>
              Analytics
            </NavLink>
            <NavLink to="/trends" className={linkClass}>
              Trends
            </NavLink>
            <NavLink to="/upload" className={linkClass}>
              Upload
            </NavLink>
            <NavLink to="/settings" className={linkClass}>
              Settings
            </NavLink>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {tutor && (
            <span className="text-sm text-gray-600">{tutor.name}</span>
          )}
          <button
            onClick={logout}
            className="rounded px-3 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            Log out
          </button>
        </div>
      </nav>
      <Outlet />
    </div>
  );
}

// --- Student flow (public, no auth required) ---

function StudentFlow() {
  const { code } = useParams<{ code?: string }>();
  const [joined, setJoined] = useState<{
    sessionId: string;
    participantToken: string;
  } | null>(null);

  if (joined) {
    // Student has joined — connect WebSocket and show session view
    return (
      <StudentSessionWithWs
        sessionId={joined.sessionId}
        token={joined.participantToken}
      />
    );
  }

  return (
    <StudentJoinPage
      onJoin={(sessionId, participantToken) =>
        setJoined({ sessionId, participantToken })
      }
      initialCode={code}
    />
  );
}

function StudentSessionWithWs({
  sessionId,
  token,
}: {
  sessionId: string;
  token: string;
}) {
  const [ws] = useState<WebSocket | null>(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    return new WebSocket(
      `${protocol}//${host}/ws/session/${sessionId}?token=${token}`,
    );
  });

  return <StudentSession sessionId={sessionId} token={token} ws={ws} />;
}

// --- Tutor session placeholder (Chunk B) ---

function TutorSessionPlaceholder() {
  const { sessionId } = useParams<{ sessionId: string }>();

  return (
    <div className="flex items-center justify-center p-12">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">
          Live Session
        </h2>
        <p className="text-gray-500 text-sm">
          Session {sessionId} — live dashboard will be wired in next chunk.
        </p>
      </div>
    </div>
  );
}

// --- Authenticated wrappers for existing components ---

function AuthAnalyticsList() {
  const { token } = useAuth();
  return <AnalyticsListPage token={token!} />;
}

function AuthAnalyticsDetail() {
  const { token } = useAuth();
  return <AnalyticsDetailPage token={token!} />;
}

function AuthTrends() {
  const { token } = useAuth();
  return <TrendsPage token={token!} />;
}

function AuthUpload() {
  const { token } = useAuth();
  const navigate = useNavigate();

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h2 className="mb-6 text-lg font-semibold text-gray-800">
        Analyze Pre-Recorded Session
      </h2>
      <UploadForm
        token={token!}
        onUploadComplete={(sid) => navigate(`/analytics/${sid}`)}
      />
    </main>
  );
}

function SettingsPage() {
  const { token } = useAuth();
  const { preferences, loading, saving, error, save } = usePreferences(token!);

  if (loading) {
    return (
      <div className="flex justify-center p-12 text-gray-400">
        Loading settings...
      </div>
    );
  }

  if (error && !preferences) {
    return (
      <div className="p-8 text-center text-red-600">{error}</div>
    );
  }

  if (!preferences) return null;

  return <NudgeSettings preferences={preferences} onSave={save} saving={saving} />;
}

export default App;
