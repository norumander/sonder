/** Base URL for backend API calls. Falls back to localhost for development. */
export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

/** Google OAuth Client ID for the sign-in button. */
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
