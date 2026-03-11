/**
 * Root application component with routing, authentication, and navigation.
 */

import { useState, useEffect, useCallback } from "react";
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
import { PrivacyConsentModal } from "./auth/PrivacyConsentModal";
import { API_BASE } from "./shared/config";
import { LoginPage } from "./auth/LoginPage";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { CreateSessionPage } from "./sessions/CreateSessionPage";
import { SessionEndedScreen } from "./sessions/SessionEndedScreen";
import { useSessionEnded } from "./sessions/useSessionEnded";
import { TutorSessionPage } from "./sessions/TutorSessionPage";
import { UploadForm } from "./sessions/UploadForm";
import { AnalyticsListPage, AnalyticsDetailPage } from "./analytics/AnalyticsPage";
import { TrendsPage } from "./analytics/TrendsPage";
import { NudgeSettings } from "./settings/NudgeSettings";
import { usePreferences } from "./settings/usePreferences";
import { StudentJoinPage } from "./student/StudentJoinPage";
import { StudentSession } from "./student/StudentSession";
import { StudentLeftScreen } from "./student/StudentLeftScreen";

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
              <Route path="/session/:sessionId" element={<TutorSessionRoute />} />
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
  const { tutor, logout, acceptPrivacy } = useAuth();

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
      {tutor && !tutor.privacy_accepted && (
        <PrivacyConsentModal onAccept={acceptPrivacy} />
      )}
      <Outlet />
    </div>
  );
}

// --- Student flow (public, no auth required) ---

function StudentFlow() {
  const { code } = useParams<{ code?: string }>();
  const [session, setSession] = useState<{
    sessionId: string;
    participantToken: string;
  } | null>(null);
  const [active, setActive] = useState(false);

  // WebSocket lives at this level — stays open as long as session exists,
  // regardless of active/left state. This ensures session_ended is always received.
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    if (!session) {
      setWs(null);
      return;
    }
    const socket = new WebSocket(buildWsUrl(session.sessionId, session.participantToken));
    setWs(socket);
    return () => {
      socket.close();
    };
  }, [session?.sessionId, session?.participantToken]);

  // Session-ended detection at the flow level — catches the message
  // whether the student is on the active session screen or the left screen.
  const { sessionEnded, endReason } = useSessionEnded(ws);

  // Track tutor connection status at the flow level so it persists
  // across leave/rejoin (StudentSession unmount/remount).
  const [tutorConnected, setTutorConnected] = useState(false);

  useEffect(() => {
    if (!ws) return;

    function handleMessage(event: MessageEvent) {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "tutor_status") {
          setTutorConnected(msg.data.connected);
        } else if (msg.type === "session_status") {
          setTutorConnected(msg.data.tutor_connected);
        }
      } catch {
        // Ignore non-JSON messages
      }
    }

    ws.addEventListener("message", handleMessage);
    return () => ws.removeEventListener("message", handleMessage);
  }, [ws]);

  // Notify backend when student leaves/rejoins so the tutor dashboard updates
  const handleLeave = useCallback(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "student_leave" }));
    }
    setActive(false);
  }, [ws]);

  const handleRejoin = useCallback(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "student_rejoin" }));
    }
    setActive(true);
  }, [ws]);

  // Session ended — takes priority over all other states
  if (session && sessionEnded) {
    return <SessionEndedScreen reason={endReason} />;
  }

  // Student is in the live session
  if (session && active) {
    if (!ws) {
      // WebSocket is being created (useEffect hasn't fired yet)
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-900">
          <p className="text-white text-sm">Connecting…</p>
        </div>
      );
    }
    return (
      <StudentSession
        sessionId={session.sessionId}
        token={session.participantToken}
        ws={ws}
        tutorConnected={tutorConnected}
        onLeave={handleLeave}
      />
    );
  }

  // Student left voluntarily — show rejoin screen
  if (session && !active) {
    return <StudentLeftScreen onRejoin={handleRejoin} />;
  }

  // Initial state — join page
  return (
    <StudentJoinPage
      onJoin={(sessionId, participantToken) => {
        setSession({ sessionId, participantToken });
        setActive(true);
      }}
      initialCode={code}
    />
  );
}

function buildWsUrl(sessionId: string, token: string): string {
  const url = new URL(API_BASE);
  const protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${url.host}/ws/session/${sessionId}?token=${token}`;
}

// --- Tutor live session with WebSocket ---

function TutorSessionRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { token } = useAuth();
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    if (!token || !sessionId) return;
    const socket = new WebSocket(buildWsUrl(sessionId, token));
    setWs(socket);
    return () => {
      socket.close();
    };
  }, [sessionId, token]);

  if (!sessionId || !token) return null;

  return <TutorSessionPage sessionId={sessionId} token={token} ws={ws} />;
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
