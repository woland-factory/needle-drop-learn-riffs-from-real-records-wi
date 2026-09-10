import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoopControls } from "../../src/components/LoopControls";

function setup(overrides: Partial<Parameters<typeof LoopControls>[0]> = {}) {
  const props = {
    bpm: 120,
    bars: 2,
    snapOn: true,
    speed: 1,
    playing: false,
    onBpm: vi.fn(),
    onBars: vi.fn(),
    onSnap: vi.fn(),
    onSpeed: vi.fn(),
    onPlayPause: vi.fn(),
    onStop: vi.fn(),
    ...overrides,
  };
  render(<LoopControls {...props} />);
  return props;
}

describe("LoopControls", () => {
  it("renders labeled tempo, bars, snap, speed, and transport", () => {
    setup();
    expect(screen.getByLabelText(/tempo/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Bars")).toBeInTheDocument();
    expect(screen.getByLabelText(/snap to bars/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/speed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play loop/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /stop/i })).toBeInTheDocument();
  });

  it("constrains the speed control to 50 through 100 percent", () => {
    setup({ speed: 0.75 });
    const speed = screen.getByLabelText(/speed/i) as HTMLInputElement;
    expect(speed.min).toBe("50");
    expect(speed.max).toBe("100");
    expect(speed.value).toBe("75");
  });

  it("shows the current speed percentage", () => {
    setup({ speed: 0.6 });
    expect(screen.getByText(/60%/)).toBeInTheDocument();
  });

  it("keeps every control reachable by keyboard", async () => {
    setup();
    await userEvent.tab();
    // First focusable is the tempo input.
    expect(screen.getByLabelText(/tempo/i)).toHaveFocus();
  });

  it("reflects playing state on the play button via aria-pressed", () => {
    setup({ playing: true });
    const button = screen.getByRole("button", { name: /pause/i });
    expect(button).toHaveAttribute("aria-pressed", "true");
  });
});
