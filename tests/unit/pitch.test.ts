import { describe, it, expect } from "vitest";
import { midiToFreq, midiToName } from "../../src/audio/pitch";

describe("midiToFreq", () => {
  it("puts A4 (69) at 440 Hz", () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
  });

  it("is an octave up for +12 semitones", () => {
    expect(midiToFreq(81)).toBeCloseTo(880, 6);
  });

  it("matches the standard E2 frequency", () => {
    expect(midiToFreq(40)).toBeCloseTo(82.41, 2);
  });
});

describe("midiToName", () => {
  it("names E2 for 40", () => {
    expect(midiToName(40)).toBe("E2");
  });

  it("names A4 for 69 and C4 for 60", () => {
    expect(midiToName(69)).toBe("A4");
    expect(midiToName(60)).toBe("C4");
  });

  it("uses sharps for black keys", () => {
    expect(midiToName(61)).toBe("C#4");
  });
});
