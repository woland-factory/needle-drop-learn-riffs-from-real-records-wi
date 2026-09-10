import { describe, expect, it } from "vitest";
import { computePeaks } from "../../src/audio/peaks";

describe("computePeaks", () => {
  it("returns one min/max pair per bucket", () => {
    const data = new Float32Array([0, 0.5, -0.5, 1, -1, 0.25, -0.25, 0]);
    const peaks = computePeaks(data, 2);
    expect(peaks).toHaveLength(2);
  });

  it("captures the min and max within each bucket deterministically", () => {
    const data = new Float32Array([0, 0.5, -0.5, 1, -1, 0.25, -0.25, 0]);
    const peaks = computePeaks(data, 2);
    expect(peaks[0]).toEqual({ min: -0.5, max: 1 });
    expect(peaks[1]).toEqual({ min: -1, max: 0.25 });
  });

  it("is stable across repeated calls for the same input", () => {
    const data = new Float32Array([0.1, -0.2, 0.3, -0.4, 0.5, -0.6]);
    expect(computePeaks(data, 3)).toEqual(computePeaks(data, 3));
  });

  it("returns an empty array for empty input or zero buckets", () => {
    expect(computePeaks(new Float32Array([]), 4)).toEqual([]);
    expect(computePeaks(new Float32Array([1, 2, 3]), 0)).toEqual([]);
  });
});
