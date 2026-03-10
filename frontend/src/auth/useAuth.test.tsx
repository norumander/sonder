import { render, screen, act } from "@testing-library/react";
import { useState } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AuthProvider, useAuth } from "./useAuth";

// Test component that exposes auth state
function AuthConsumer() {
  const { token, tutor, loading, login, logout } = useAuth();
  const [loginError, setLoginError] = useState<string | null>(null);
  return (
    <div>
      <span data-testid="token">{token ?? "null"}</span>
      <span data-testid="tutor">{tutor ? tutor.name : "null"}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="login-error">{loginError ?? "null"}</span>
      <button
        data-testid="login"
        onClick={() => login("google-cred").catch((e) => setLoginError(e.message))}
      />
      <button data-testid="logout" onClick={logout} />
    </div>
  );
}

function renderAuth() {
  return render(
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>,
  );
}

describe("useAuth", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("starts with null token and tutor when localStorage is empty", () => {
    renderAuth();
    expect(screen.getByTestId("token").textContent).toBe("null");
    expect(screen.getByTestId("tutor").textContent).toBe("null");
  });

  it("restores token and tutor from localStorage on mount", () => {
    localStorage.setItem("sonder_token", "saved-jwt");
    localStorage.setItem(
      "sonder_tutor",
      JSON.stringify({ id: "1", name: "Alice", email: "a@b.com" }),
    );

    renderAuth();
    expect(screen.getByTestId("token").textContent).toBe("saved-jwt");
    expect(screen.getByTestId("tutor").textContent).toBe("Alice");
  });

  it("login calls backend and stores credentials on success", async () => {
    const mockResponse = {
      access_token: "new-jwt",
      tutor: { id: "2", name: "Bob", email: "b@b.com" },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    renderAuth();

    await act(async () => {
      screen.getByTestId("login").click();
    });

    expect(screen.getByTestId("token").textContent).toBe("new-jwt");
    expect(screen.getByTestId("tutor").textContent).toBe("Bob");
    expect(localStorage.getItem("sonder_token")).toBe("new-jwt");
    expect(JSON.parse(localStorage.getItem("sonder_tutor")!).name).toBe("Bob");
  });

  it("login sets error and does not store on backend failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ detail: "Invalid token" }),
    } as Response);

    renderAuth();

    await act(async () => {
      screen.getByTestId("login").click();
    });

    expect(screen.getByTestId("token").textContent).toBe("null");
    expect(screen.getByTestId("login-error").textContent).toBe("Invalid token");
    expect(localStorage.getItem("sonder_token")).toBeNull();
  });

  it("logout clears token, tutor, and localStorage", async () => {
    localStorage.setItem("sonder_token", "jwt");
    localStorage.setItem(
      "sonder_tutor",
      JSON.stringify({ id: "1", name: "Test", email: "t@t.com" }),
    );

    renderAuth();
    expect(screen.getByTestId("token").textContent).toBe("jwt");

    await act(async () => {
      screen.getByTestId("logout").click();
    });

    expect(screen.getByTestId("token").textContent).toBe("null");
    expect(screen.getByTestId("tutor").textContent).toBe("null");
    expect(localStorage.getItem("sonder_token")).toBeNull();
    expect(localStorage.getItem("sonder_tutor")).toBeNull();
  });

  it("throws when used outside AuthProvider", () => {
    // Suppress React error boundary console output
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<AuthConsumer />)).toThrow(
      "useAuth must be used within an AuthProvider",
    );

    spy.mockRestore();
  });
});
