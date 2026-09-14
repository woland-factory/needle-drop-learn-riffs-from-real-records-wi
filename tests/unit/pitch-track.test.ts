import { describe, it, expect } from "vitest";
import { trackPitch } from "../../src/audio/pitch-track";
import { synthTake, silenceTake, SR } from "./helpers/synth";

describe("trackPitch", () => {
  it("yields voiced frames at the right MIDI in the right spans", () => {
    // Two notes back to back: A2 (45) then E3 (52).
    const take = synthTake([
      { midi: 45, startSec: 0, durSec: 0.5 },
      { midi: 52, startSec: 0.5, durSec: 0.5 },
    ], SR);
    const frames = trackPitch(take);
    expect(frames.length).toBeGreaterThan(10);

    const first = frames.filter((f) => f.timeSec > 0.15 && f.timeSec < 0.35 && f.midi !== null);
    const second = frames.filter((f) => f.timeSec > 0.65 && f.timeSec < 0.85 && f.midi !== null);
    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
    const med = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    expect(med(first.map((f) => f.midi as number))).toBeCloseTo(45, 0);
    expect(med(second.map((f) => f.midi as number))).toBeCloseTo(52, 0);
  });

  it("marks frames over silence as unvoiced", () => {
    const frames = trackPitch(silenceTake(0.5));
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((f) => f.midi === null)).toBe(true);
  });

  it("returns an empty track for an empty take", () => {
    expect(trackPitch({ samples: new Float32Array(0), sampleRate: SR })).toEqual([]);
  });
});
