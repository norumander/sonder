import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SessionList } from "./SessionList";
import type { SessionListItem } from "./types";

const mockSessions: SessionListItem[] = [
  {
    id: "s1",
    join_code: "ABC123",
    status: "completed",
    subject: "Math",
    student_display_name: "Alice",
    start_time: "2026-03-09T10:00:00Z",
    end_time: "2026-03-09T10:30:00Z",
  },
  {
    id: "s2",
    join_code: "DEF456",
    status: "completed",
    subject: null,
    student_display_name: null,
    start_time: "2026-03-08T14:00:00Z",
    end_time: "2026-03-08T14:45:00Z",
  },
];

describe("SessionList", () => {
  const defaultProps = {
    sessions: mockSessions,
    total: 2,
    loading: false,
    error: null,
    page: 0,
    onPageChange: vi.fn(),
    onSelectSession: vi.fn(),
  };

  it("renders session rows with correct data", () => {
    render(<SessionList {...defaultProps} />);

    expect(screen.getByTestId("session-list")).toBeInTheDocument();
    expect(screen.getByTestId("session-row-s1")).toBeInTheDocument();
    expect(screen.getByTestId("session-row-s2")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Math")).toBeInTheDocument();
    expect(screen.getByText("30 min")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(<SessionList {...defaultProps} loading={true} sessions={[]} />);
    expect(screen.getByTestId("session-list-loading")).toBeInTheDocument();
  });

  it("shows error state", () => {
    render(<SessionList {...defaultProps} error="Network error" sessions={[]} />);
    expect(screen.getByTestId("session-list-error")).toBeInTheDocument();
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });

  it("shows empty state when no sessions", () => {
    render(<SessionList {...defaultProps} sessions={[]} total={0} />);
    expect(screen.getByTestId("session-list-empty")).toBeInTheDocument();
  });

  it("calls onSelectSession when row clicked", () => {
    const onSelect = vi.fn();
    render(<SessionList {...defaultProps} onSelectSession={onSelect} />);

    fireEvent.click(screen.getByTestId("session-row-s1"));
    expect(onSelect).toHaveBeenCalledWith("s1");
  });

  it("renders pagination when total exceeds page size", () => {
    render(<SessionList {...defaultProps} total={25} />);
    expect(screen.getByTestId("pagination")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });

  it("does not render pagination when all fit on one page", () => {
    render(<SessionList {...defaultProps} total={5} />);
    expect(screen.queryByTestId("pagination")).not.toBeInTheDocument();
  });

  it("calls onPageChange when next clicked", () => {
    const onPageChange = vi.fn();
    render(<SessionList {...defaultProps} total={25} onPageChange={onPageChange} />);

    fireEvent.click(screen.getByTestId("next-page"));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("disables previous on first page", () => {
    render(<SessionList {...defaultProps} total={25} page={0} />);
    expect(screen.getByTestId("prev-page")).toBeDisabled();
  });

  it("disables next on last page", () => {
    render(<SessionList {...defaultProps} total={25} page={2} />);
    expect(screen.getByTestId("next-page")).toBeDisabled();
  });

  it("shows -- for null student name and subject", () => {
    render(<SessionList {...defaultProps} />);
    const row = screen.getByTestId("session-row-s2");
    const cells = row.querySelectorAll("td");
    // Student name (2nd cell) and subject (3rd cell) should be "--"
    expect(cells[1].textContent).toBe("--");
    expect(cells[2].textContent).toBe("--");
  });
});
