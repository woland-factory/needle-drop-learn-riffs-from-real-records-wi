import { describe, it, expect } from "vitest";
import { planSchedule } from "../../src/audio/note-synth";
import { midiToFreq } from "../../src/audio/pitch";
import type { Note } from "../../src/audio/note";

const notes: Note[] = [
  { id: "b", midi: 45, startSec: 1.0, durSec: 0.5, confidence: 1, edited: false },
  { id: "a", midi: 40, startSec: 0.0, durSec: 0.5, confidence: 1, edited: false },
];

describe("planSchedule", () => {
  it("sorts by start and offsets times by the anchor", () => {
    const plan = planSchedule(notes, 10);
    expect(plan).toHaveLength(2);
    expect(plan[0].startAt).toBeCloseTo(10.0, 6);
    expect(plan[0].stopAt).toBeCloseTo(10.5, 6);
    expect(plan[1].startAt).toBeCloseTo(11.0, 6);
    expect(plan[1].stopAt).toBeCloseTo(11.5, 6);
  });

  it("uses the correct frequency per note", () => {
    const plan = planSchedule(notes, 0);
    expect(plan[0].freq).toBeCloseTo(midiToFreq(40), 6);
    expect(plan[1].freq).toBeCloseTo(midiToFreq(45), 6);
  });

  it("returns an empty plan for no notes", () => {
    expect(planSchedule([], 5)).toEqual([]);
  });
});
