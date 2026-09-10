import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorState } from "../../src/components/states/ErrorState";

describe("ErrorState", () => {
  it("explains an unsupported file in the product voice with a next step", () => {
    render(<ErrorState kind="unsupported" onRetry={vi.fn()} />);
    expect(
      screen.getByText(/that file would not open\. try an mp3, wav, ogg, or flac\./i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /choose another song/i }),
    ).toBeInTheDocument();
  });

  it("explains an oversized file", () => {
    render(<ErrorState kind="too-large" onRetry={vi.fn()} />);
    expect(screen.getByText(/that file is large/i)).toBeInTheDocument();
  });

  it("shows no stack trace, error code, or negative filler", () => {
    const { container } = render(
      <ErrorState kind="unsupported" onRetry={vi.fn()} />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/[—–]/);
    expect(text).not.toMatch(/something went wrong|unable to|error code|stack/i);
  });

  it("calls onRetry when the user picks another song", async () => {
    const onRetry = vi.fn();
    render(<ErrorState kind="unsupported" onRetry={onRetry} />);
    await userEvent.click(
      screen.getByRole("button", { name: /choose another song/i }),
    );
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
