import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

  it("shows generic message for null reason", () => {
    render(<SessionEndedScreen reason={null} />);
    expect(screen.getByText("Session Ended")).toBeInTheDocument();
  });

  it("does not show analytics link without sessionId", () => {
    render(<SessionEndedScreen reason={null} />);
    expect(screen.queryByTestId("view-analytics")).not.toBeInTheDocument();
  });

  it("shows analytics link when sessionId is provided", () => {
    render(<SessionEndedScreen reason={null} sessionId="abc-123" />);
    const link = screen.getByTestId("view-analytics");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/analytics/abc-123");
  });

  it("calls onViewAnalytics callback when provided", () => {
    const handleClick = vi.fn();
    render(<SessionEndedScreen reason={null} onViewAnalytics={handleClick} />);
    fireEvent.click(screen.getByTestId("view-analytics"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
