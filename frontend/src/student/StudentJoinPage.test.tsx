import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StudentJoinPage } from "./StudentJoinPage";

const API_BASE = "http://localhost:8000";

describe("StudentJoinPage", () => {
  let onJoin: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onJoin = vi.fn();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders code input and display name input", () => {
    render(<StudentJoinPage onJoin={onJoin} />);

    expect(screen.getByLabelText(/session code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /join session/i })).toBeInTheDocument();
  });

  it("requires display name to be non-empty", async () => {
    render(<StudentJoinPage onJoin={onJoin} />);

    const codeInput = screen.getByLabelText(/session code/i);
    const joinButton = screen.getByRole("button", { name: /join session/i });

    fireEvent.change(codeInput, { target: { value: "ABC123" } });
    fireEvent.click(joinButton);

    expect(onJoin).not.toHaveBeenCalled();
    expect(screen.getByText(/display name is required/i)).toBeInTheDocument();
  });

  it("requires display name max 50 chars", async () => {
    render(<StudentJoinPage onJoin={onJoin} />);

    const codeInput = screen.getByLabelText(/session code/i);
    const nameInput = screen.getByLabelText(/display name/i);
    const joinButton = screen.getByRole("button", { name: /join session/i });

    fireEvent.change(codeInput, { target: { value: "ABC123" } });
    fireEvent.change(nameInput, { target: { value: "a".repeat(51) } });
    fireEvent.click(joinButton);

    expect(onJoin).not.toHaveBeenCalled();
    expect(screen.getByText(/50 characters or fewer/i)).toBeInTheDocument();
  });

  it("requires session code to be non-empty", async () => {
    render(<StudentJoinPage onJoin={onJoin} />);

    const nameInput = screen.getByLabelText(/display name/i);
    const joinButton = screen.getByRole("button", { name: /join session/i });

    fireEvent.change(nameInput, { target: { value: "Alice" } });
    fireEvent.click(joinButton);

    expect(onJoin).not.toHaveBeenCalled();
    expect(screen.getByText(/session code is required/i)).toBeInTheDocument();
  });

  it("calls POST /sessions/join and onJoin on success", async () => {
    const mockResponse = {
      session_id: "sess-123",
      participant_token: "tok-abc",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }),
    );

    render(<StudentJoinPage onJoin={onJoin} />);

    fireEvent.change(screen.getByLabelText(/session code/i), {
      target: { value: "XYZ789" },
    });
    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: "Alice" },
    });
    fireEvent.click(screen.getByRole("button", { name: /join session/i }));

    await waitFor(() => {
      expect(onJoin).toHaveBeenCalledWith("sess-123", "tok-abc");
    });

    expect(fetch).toHaveBeenCalledWith(`${API_BASE}/sessions/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ join_code: "XYZ789", display_name: "Alice" }),
    });
  });

  it("shows error when session code is invalid (404)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ detail: "Session not found" }),
      }),
    );

    render(<StudentJoinPage onJoin={onJoin} />);

    fireEvent.change(screen.getByLabelText(/session code/i), {
      target: { value: "BADCOD" },
    });
    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: "Alice" },
    });
    fireEvent.click(screen.getByRole("button", { name: /join session/i }));

    await waitFor(() => {
      expect(screen.getByText(/session not found/i)).toBeInTheDocument();
    });
    expect(onJoin).not.toHaveBeenCalled();
  });

  it("shows error when session already has a student (409)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ detail: "Session already has a student" }),
      }),
    );

    render(<StudentJoinPage onJoin={onJoin} />);

    fireEvent.change(screen.getByLabelText(/session code/i), {
      target: { value: "ABC123" },
    });
    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: "Bob" },
    });
    fireEvent.click(screen.getByRole("button", { name: /join session/i }));

    await waitFor(() => {
      expect(screen.getByText(/already has a student/i)).toBeInTheDocument();
    });
    expect(onJoin).not.toHaveBeenCalled();
  });

  it("disables button while submitting", async () => {
    let resolveRequest: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
      ),
    );

    render(<StudentJoinPage onJoin={onJoin} />);

    fireEvent.change(screen.getByLabelText(/session code/i), {
      target: { value: "ABC123" },
    });
    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: "Alice" },
    });
    fireEvent.click(screen.getByRole("button", { name: /join session/i }));

    expect(screen.getByRole("button", { name: /joining/i })).toBeDisabled();

    resolveRequest!({
      ok: true,
      json: () => Promise.resolve({ session_id: "s1", participant_token: "t1" }),
    });

    await waitFor(() => {
      expect(onJoin).toHaveBeenCalled();
    });
  });
});
