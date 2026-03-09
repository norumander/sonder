import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SessionEndedScreen } from "./SessionEndedScreen";

describe("SessionEndedScreen", () => {
  it("renders session ended message", () => {
    render(<SessionEndedScreen reason="tutor_ended" />);
    expect(screen.getByText("Session Ended")).toBeInTheDocument();
  });

  it("shows tutor ended reason", () => {
    render(<SessionEndedScreen reason="tutor_ended" />);
    expect(
      screen.getByText(/tutor ended the session/i),
    ).toBeInTheDocument();
  });

  it("shows timeout reason", () => {
    render(<SessionEndedScreen reason="student_disconnect_timeout" />);
    expect(
      screen.getByText(/student disconnected/i),
    ).toBeInTheDocument();
  });

  it("shows generic message for null reason", () => {
    render(<SessionEndedScreen reason={null} />);
    expect(screen.getByText("Session Ended")).toBeInTheDocument();
  });
});
