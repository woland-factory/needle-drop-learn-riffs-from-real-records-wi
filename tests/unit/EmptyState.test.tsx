import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmptyState } from "../../src/components/states/EmptyState";

const NEGATIVE = [/you don't have/i, /no .* yet/i, /nothing .* here/i];

describe("EmptyState", () => {
  it("tells the user what to do and shows the sample entry point", () => {
    render(<EmptyState onFile={vi.fn()} onSample={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: /drop in a song to start/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /choose a song/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /play a sample loop/i }),
    ).toBeInTheDocument();
  });

  it("uses positive phrasing with no em-dashes or banned words", () => {
    const { container } = render(
      <EmptyState onFile={vi.fn()} onSample={vi.fn()} />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/[—–]/);
    for (const pattern of NEGATIVE) {
      expect(text).not.toMatch(pattern);
    }
  });

  it("triggers the sample loader", async () => {
    const onSample = vi.fn();
    render(<EmptyState onFile={vi.fn()} onSample={onSample} />);
    await userEvent.click(
      screen.getByRole("button", { name: /play a sample loop/i }),
    );
    expect(onSample).toHaveBeenCalledOnce();
  });
});
