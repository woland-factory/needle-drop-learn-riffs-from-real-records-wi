import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadingState } from "../../src/components/states/LoadingState";

describe("LoadingState", () => {
  it("holds the layout steady with waveform and control skeletons", () => {
    const { container } = render(<LoadingState />);
    expect(container.querySelector(".skeleton-wave")).toBeInTheDocument();
    expect(container.querySelectorAll(".skeleton-row").length).toBeGreaterThan(0);
  });

  it("marks itself busy for assistive tech", () => {
    const { container } = render(<LoadingState />);
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it("shows a short reassuring note", () => {
    render(<LoadingState />);
    expect(screen.getByText(/reading your song/i)).toBeInTheDocument();
  });
});
