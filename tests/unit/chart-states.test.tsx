import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TranscribingState } from "../../src/components/states/TranscribingState";
import { NoPitchState } from "../../src/components/states/NoPitchState";

describe("TranscribingState", () => {
  it("shows honest progress and a way out", () => {
    const onCancel = vi.fn();
    render(<TranscribingState progress={0.42} onCancel={onCancel} />);
    expect(screen.getByRole("heading", { name: /reading the notes/i })).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe("NoPitchState", () => {
  it("names the problem and offers a next step", () => {
    const onBack = vi.fn();
    render(<NoPitchState onBack={onBack} />);
    expect(
      screen.getByRole("heading", { name: /this part is hard to read/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/one clear note at a time/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /pick another part/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
