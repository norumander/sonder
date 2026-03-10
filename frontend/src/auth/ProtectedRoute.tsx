/**
 * Route guard that redirects unauthenticated users to the login page.
 * Renders child routes via Outlet when authenticated.
 */

import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./useAuth";

export function ProtectedRoute() {
  const { token } = useAuth();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
