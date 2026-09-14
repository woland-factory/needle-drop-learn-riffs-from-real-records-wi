import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MicPrompt } from "../../src/components/states/MicPrompt";

describe("MicPrompt", () => {
  it("shows the request, with a next step, never a dead end", () => {
    const onAction = vi.fn();
    render(<MicPrompt variant="prompt" onAction={onAction} onBack={() => {}} />);
    expect(screen.getByRole("heading", { name: /let needle drop hear you play/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /turn on mic/i }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("shows the denied variant with a try-again step", () => {
    render(<MicPrompt variant="denied" onAction={() => {}} onBack={() => {}} />);
    expect(screen.getByText(/allow mic access in your browser/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("shows the unavailable variant with a next step", () => {
    render(<MicPrompt variant="unavailable" onAction={() => {}} onBack={() => {}} />);
    expect(screen.getByRole("heading", { name: /connect a microphone/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
