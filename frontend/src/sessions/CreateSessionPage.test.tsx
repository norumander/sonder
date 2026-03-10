import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth/useAuth";
import { CreateSessionPage } from "./CreateSessionPage";

function renderPage() {
  localStorage.setItem("sonder_token", "test-jwt");
  localStorage.setItem(
    "sonder_tutor",
    JSON.stringify({ id: "1", name: "Test Tutor", email: "t@t.com" }),
  );

  return render(
    <AuthProvider>
      <MemoryRouter>
        <CreateSessionPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("CreateSessionPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders the form with subject field and create button", () => {
    renderPage();
    expect(screen.getByText("New Session")).toBeInTheDocument();
    expect(screen.getByLabelText("Subject (optional)")).toBeInTheDocument();
    expect(screen.getByText("Create Session")).toBeInTheDocument();
  });

  it("shows join code and share link after successful creation", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          session_id: "sess-1",
          join_code: "ABC123",
          join_url: "/join/ABC123",
          start_time: "2026-03-09T12:00:00Z",
        }),
    } as Response);

    renderPage();
    fireEvent.click(screen.getByText("Create Session"));

    await waitFor(() => {
      expect(screen.getByTestId("join-code")).toHaveTextContent("ABC123");
    });

    expect(screen.getByText("Session Created")).toBeInTheDocument();
    expect(screen.getByText("Start Session")).toBeInTheDocument();
  });

  it("shows error message on API failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ detail: "Server error" }),
    } as Response);

    renderPage();
    fireEvent.click(screen.getByText("Create Session"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Server error");
    });
  });

  it("submits subject when provided", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          session_id: "sess-2",
          join_code: "DEF456",
          join_url: "/join/DEF456",
          start_time: "2026-03-09T12:00:00Z",
        }),
    } as Response);

    renderPage();
    fireEvent.change(screen.getByLabelText("Subject (optional)"), {
      target: { value: "Calculus" },
    });
    fireEvent.click(screen.getByText("Create Session"));

    await waitFor(() => {
      const body = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
      );
      expect(body.subject).toBe("Calculus");
    });
  });
});
