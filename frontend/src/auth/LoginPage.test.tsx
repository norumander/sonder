import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "./useAuth";
import { LoginPage } from "./LoginPage";

function renderLoginPage() {
  return render(
    <GoogleOAuthProvider clientId="test-client-id">
      <AuthProvider>
        <MemoryRouter initialEntries={["/login"]}>
          <LoginPage />
        </MemoryRouter>
      </AuthProvider>
    </GoogleOAuthProvider>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the app title and tagline", () => {
    renderLoginPage();
    expect(screen.getByText("Sonder")).toBeInTheDocument();
    expect(
      screen.getByText("Live tutoring engagement analytics"),
    ).toBeInTheDocument();
  });

  it("does not show error on initial render", () => {
    renderLoginPage();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
