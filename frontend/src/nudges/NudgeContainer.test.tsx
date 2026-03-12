import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { NudgeContainer } from "./NudgeContainer";
import type { NudgeData } from "../shared/types";

describe("NudgeContainer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeWs(): WebSocket {
    const listeners: Record<string, ((event: MessageEvent) => void)[]> = {};
    return {
      addEventListener: vi.fn((type: string, handler: (event: MessageEvent) => void) => {
        if (!listeners[type]) listeners[type] = [];
        listeners[type].push(handler);
      }),
      removeEventListener: vi.fn((type: string, handler: (event: MessageEvent) => void) => {
        if (listeners[type]) {
          listeners[type] = listeners[type].filter((h) => h !== handler);
        }
      }),
      _emit: (type: string, data: unknown) => {
        const event = { data: JSON.stringify(data) } as MessageEvent;
        (listeners[type] || []).forEach((h) => h(event));
      },
    } as unknown as WebSocket & { _emit: (type: string, data: unknown) => void };
  }

  function nudgeMsg(overrides: Partial<NudgeData> = {}): {
    type: "nudge";
    data: NudgeData;
    timestamp: number;
  } {
    return {
      type: "nudge",
      data: {
        nudge_type: "student_silent",
        message: "Student hasn't spoken — check for understanding",
        priority: "medium",
        ...overrides,
      },
      timestamp: Date.now(),
    };
  }

  it("renders nothing when no nudges received", () => {
    const ws = makeWs();
    const { container } = render(<NudgeContainer ws={ws} />);
    expect(container.querySelector("[data-testid='nudge-toast']")).toBeNull();
  });

  it("renders toast when nudge message received via WebSocket", () => {
    const ws = makeWs();
    render(<NudgeContainer ws={ws as WebSocket} />);

    act(() => {
      (ws as unknown as { _emit: (type: string, data: unknown) => void })._emit(
        "message",
        nudgeMsg(),
      );
    });

    expect(screen.getByText(/check for understanding/i)).toBeTruthy();
  });

  it("auto-dismisses toast after 8 seconds", () => {
    const ws = makeWs();
    render(<NudgeContainer ws={ws as WebSocket} />);

    act(() => {
      (ws as unknown as { _emit: (type: string, data: unknown) => void })._emit(
        "message",
        nudgeMsg(),
      );
    });
    expect(screen.getByTestId("nudge-toast")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.queryByTestId("nudge-toast")).toBeNull();
  });

  it("queues second nudge and shows it after first dismisses", () => {
    const ws = makeWs();
    render(<NudgeContainer ws={ws as WebSocket} />);
    const emit = (ws as unknown as { _emit: (type: string, data: unknown) => void })._emit;

    act(() => {
      emit("message", nudgeMsg({ message: "First nudge" }));
    });
    act(() => {
      emit("message", nudgeMsg({ message: "Second nudge" }));
    });

    expect(screen.getByText("First nudge")).toBeTruthy();
    expect(screen.queryByText("Second nudge")).toBeNull();

    // Dismiss first
    act(() => {
      vi.advanceTimersByTime(8000);
    });

    expect(screen.getByText("Second nudge")).toBeTruthy();
  });

  it("dismisses on close button click", () => {
    const ws = makeWs();
    render(<NudgeContainer ws={ws as WebSocket} />);

    act(() => {
      (ws as unknown as { _emit: (type: string, data: unknown) => void })._emit(
        "message",
        nudgeMsg(),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByTestId("nudge-toast")).toBeNull();
  });

  it("ignores non-nudge messages", () => {
    const ws = makeWs();
    render(<NudgeContainer ws={ws as WebSocket} />);

    act(() => {
      (ws as unknown as { _emit: (type: string, data: unknown) => void })._emit("message", {
        type: "server_metrics",
        data: {},
      });
    });

    expect(screen.queryByTestId("nudge-toast")).toBeNull();
  });

  it("handles null WebSocket gracefully", () => {
    const { container } = render(<NudgeContainer ws={null} />);
    expect(container.querySelector("[data-testid='nudge-toast']")).toBeNull();
  });
});
