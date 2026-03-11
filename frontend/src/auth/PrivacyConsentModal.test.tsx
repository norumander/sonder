import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PrivacyConsentModal } from "./PrivacyConsentModal";

describe("PrivacyConsentModal", () => {
  it("renders privacy information", () => {
    render(<PrivacyConsentModal onAccept={vi.fn()} />);

    expect(screen.getByTestId("privacy-consent-modal")).toBeInTheDocument();
    expect(screen.getByText(/privacy & data usage/i)).toBeInTheDocument();
    expect(screen.getByText(/what we analyze/i)).toBeInTheDocument();
    expect(screen.getByText(/what we never collect/i)).toBeInTheDocument();
  });

  it("disables accept button until checkbox is checked", () => {
    render(<PrivacyConsentModal onAccept={vi.fn()} />);

    const button = screen.getByTestId("privacy-accept-button");
    expect(button).toBeDisabled();

    fireEvent.click(screen.getByTestId("privacy-checkbox"));
    expect(button).not.toBeDisabled();
  });

  it("calls onAccept when agreed", async () => {
    const onAccept = vi.fn().mockResolvedValue(undefined);
    render(<PrivacyConsentModal onAccept={onAccept} />);

    fireEvent.click(screen.getByTestId("privacy-checkbox"));
    fireEvent.click(screen.getByTestId("privacy-accept-button"));

    await waitFor(() => {
      expect(onAccept).toHaveBeenCalledOnce();
    });
  });

  it("shows error on accept failure", async () => {
    const onAccept = vi.fn().mockRejectedValue(new Error("fail"));
    render(<PrivacyConsentModal onAccept={onAccept} />);

    fireEvent.click(screen.getByTestId("privacy-checkbox"));
    fireEvent.click(screen.getByTestId("privacy-accept-button"));

    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
  });

  it("lists specific data that is and is not collected", () => {
    render(<PrivacyConsentModal onAccept={vi.fn()} />);

    // Collected
    expect(screen.getByText(/eye contact score/i)).toBeInTheDocument();
    expect(screen.getByText(/voice activity/i)).toBeInTheDocument();

    // Not collected
    expect(screen.getByText(/raw video or audio recordings/i)).toBeInTheDocument();
    expect(screen.getByText(/speech transcripts/i)).toBeInTheDocument();
  });
});
