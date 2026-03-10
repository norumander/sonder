/**
 * Login page with Google OAuth sign-in button.
 * Redirects to the app on successful authentication.
 */

import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./useAuth";

export function LoginPage() {
  const { token, login, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  // Already authenticated — redirect to home
  if (token) {
    return <Navigate to="/" replace />;
  }

  async function handleSuccess(response: CredentialResponse) {
    if (!response.credential) {
      setError("No credential received from Google.");
      return;
    }
    setError(null);
    try {
      await login(response.credential);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm text-center p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Sonder</h1>
        <p className="text-gray-500 mb-8">Live tutoring engagement analytics</p>

        {loading ? (
          <p className="text-gray-400">Signing in...</p>
        ) : (
          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={handleSuccess}
              onError={() => setError("Google sign-in failed")}
            />
          </div>
        )}

        {error && (
          <p className="mt-4 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
