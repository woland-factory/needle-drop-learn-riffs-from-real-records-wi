import { describe, expect, it } from "vitest";
import { barsToSeconds, snapRegionToBars } from "../../src/audio/timing";

describe("barsToSeconds", () => {
  it("computes two bars of 4/4 at 120 BPM as 4 seconds", () => {
    expect(barsToSeconds(2, 120, 4)).toBeCloseTo(4, 10);
  });

  it("computes one bar of 4/4 at 60 BPM as 4 seconds", () => {
    expect(barsToSeconds(1, 60, 4)).toBeCloseTo(4, 10);
  });

  it("defaults beatsPerBar to 4", () => {
    expect(barsToSeconds(1, 120)).toBeCloseTo(2, 10);
  });
});

describe("snapRegionToBars", () => {
  it("produces a two-bar length region at a given tempo", () => {
    const r = snapRegionToBars(1, 2, 120, 4, 30);
    expect(r.endSec - r.startSec).toBeCloseTo(4, 10);
    expect(r.startSec).toBeCloseTo(1, 10);
  });

  it("clamps the region to the buffer duration when it would overflow", () => {
    const r = snapRegionToBars(28, 2, 120, 4, 30);
    expect(r.endSec).toBeCloseTo(30, 10);
    expect(r.endSec - r.startSec).toBeCloseTo(4, 10);
  });

  it("returns the whole buffer when the requested length exceeds it", () => {
    const r = snapRegionToBars(0, 8, 120, 4, 5);
    expect(r.startSec).toBe(0);
    expect(r.endSec).toBe(5);
  });

  it("quantizes the start to the nearest beat when asked", () => {
    // beat = 0.5s at 120 BPM; 0.7 snaps to 0.5
    const r = snapRegionToBars(0.7, 1, 120, 4, 30, true);
    expect(r.startSec).toBeCloseTo(0.5, 10);
  });
});
