import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App";

function renderApp() {
  return render(
    <GoogleOAuthProvider clientId="test-client-id">
      <App />
    </GoogleOAuthProvider>,
  );
}

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the login page when not authenticated", () => {
    renderApp();
    expect(screen.getByRole("heading", { level: 1, name: "Sonder" })).toBeInTheDocument();
    expect(screen.getByText("Elevate Tutoring Performance with AI Analytics.")).toBeInTheDocument();
  });

  it("redirects to sessions page when authenticated", () => {
    localStorage.setItem("sonder_token", "test-jwt-token");
    localStorage.setItem("sonder_tutor", JSON.stringify({ id: "1", name: "Test", email: "t@t.com" }));
    renderApp();
    // Nav bar should show tutor name and nav links
    expect(screen.getByText("Test")).toBeInTheDocument();
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("Log out")).toBeInTheDocument();
  });
});
