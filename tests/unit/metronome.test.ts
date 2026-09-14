import { describe, it, expect } from "vitest";
import { planClicks } from "../../src/audio/metronome";

describe("planClicks", () => {
  it("returns the right number of clicks at the right times", () => {
    const clicks = planClicks(4, 120, 1.0);
    expect(clicks.length).toBe(4);
    // 120 BPM: one beat every 0.5 s, starting at 1.0.
    expect(clicks.map((c) => c.at)).toEqual([1.0, 1.5, 2.0, 2.5]);
  });

  it("scales the spacing to the tempo", () => {
    const clicks = planClicks(2, 60, 0);
    expect(clicks.map((c) => c.at)).toEqual([0, 1]);
  });

  it("returns nothing for a non-positive count or tempo", () => {
    expect(planClicks(0, 120, 0)).toEqual([]);
    expect(planClicks(4, 0, 0)).toEqual([]);
  });
});
