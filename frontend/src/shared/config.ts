/** Base URL for backend API calls.
 * In production (behind reverse proxy), defaults to same origin.
 * In development, defaults to localhost:8000.
 */
export const API_BASE =
  import.meta.env.VITE_API_URL ??
  (typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? window.location.origin
    : "http://localhost:8000");

/** Google OAuth Client ID for the sign-in button. */
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
