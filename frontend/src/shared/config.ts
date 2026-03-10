/** Base URL for backend API calls. Falls back to localhost for development. */
export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
