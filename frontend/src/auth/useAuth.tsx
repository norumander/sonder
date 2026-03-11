/**
 * Authentication context and hook.
 *
 * Provides Google OAuth login via the backend, JWT storage in localStorage,
 * and current tutor profile state.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { API_BASE } from "../shared/config";

/** Tutor profile returned from the backend after authentication. */
export interface Tutor {
  id: string;
  name: string;
  email: string;
  privacy_accepted: boolean;
}

interface AuthState {
  token: string | null;
  tutor: Tutor | null;
  loading: boolean;
  login: (googleCredential: string) => Promise<void>;
  logout: () => void;
  acceptPrivacy: () => Promise<void>;
}

const TOKEN_KEY = "sonder_token";
const TUTOR_KEY = "sonder_tutor";

const AuthContext = createContext<AuthState | null>(null);

/**
 * Provides authentication state to the component tree.
 * Persists JWT and tutor profile in localStorage.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem(TOKEN_KEY),
  );
  const [tutor, setTutor] = useState<Tutor | null>(() => {
    const stored = localStorage.getItem(TUTOR_KEY);
    if (!stored) return null;
    try {
      return JSON.parse(stored) as Tutor;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (googleCredential: string) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: googleCredential }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.detail ?? "Authentication failed");
      }

      const data = await response.json();
      localStorage.setItem(TOKEN_KEY, data.access_token);
      localStorage.setItem(TUTOR_KEY, JSON.stringify(data.tutor));
      setToken(data.access_token);
      setTutor(data.tutor);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TUTOR_KEY);
    setToken(null);
    setTutor(null);
  }, []);

  const acceptPrivacy = useCallback(async () => {
    if (!token) return;
    const response = await fetch(`${API_BASE}/auth/accept-privacy`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error("Failed to accept privacy policy");
    }
    setTutor((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, privacy_accepted: true };
      localStorage.setItem(TUTOR_KEY, JSON.stringify(updated));
      return updated;
    });
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, tutor, loading, login, logout, acceptPrivacy }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access authentication state.
 * Must be used within an AuthProvider.
 */
export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
