import { describe, it, expect } from "vitest";
import {
  isClearEnough,
  reduceToMonophonic,
  type RawNoteEvent,
} from "../../src/audio/monophonic";
import { MIDI_MAX, MIDI_MIN, type Note } from "../../src/audio/note";

function strip(notes: Note[]) {
  return notes.map(({ midi, startSec, durSec }) => ({ midi, startSec, durSec }));
}

function assertNonOverlapping(notes: Note[]) {
  for (let i = 0; i < notes.length - 1; i++) {
    // Sorted by start.
    expect(notes[i].startSec).toBeLessThanOrEqual(notes[i + 1].startSec);
    // No overlap: this note ends no later than the next one starts.
    expect(notes[i].startSec + notes[i].durSec).toBeLessThanOrEqual(
      notes[i + 1].startSec + 1e-9,
    );
  }
}

describe("reduceToMonophonic", () => {
  it("drops a lower-confidence overlapping note", () => {
    const events: RawNoteEvent[] = [
      { midi: 40, startSec: 0, durSec: 0.5, confidence: 0.9 },
      { midi: 45, startSec: 0.3, durSec: 0.5, confidence: 0.5 },
    ];
    const out = reduceToMonophonic(events);
    expect(out).toHaveLength(1);
    expect(out[0].midi).toBe(40);
    assertNonOverlapping(out);
  });

  it("truncates the previous note when a stronger, later note starts", () => {
    const events: RawNoteEvent[] = [
      { midi: 40, startSec: 0, durSec: 0.5, confidence: 0.6 },
      { midi: 50, startSec: 0.3, durSec: 0.5, confidence: 0.95 },
    ];
    const out = reduceToMonophonic(events);
    expect(out).toHaveLength(2);
    expect(out[0].midi).toBe(40);
    expect(out[0].durSec).toBeCloseTo(0.3, 6);
    expect(out[1].midi).toBe(50);
    assertNonOverlapping(out);
  });

  it("keeps a non-overlapping run intact and stays sorted", () => {
    const events: RawNoteEvent[] = [
      { midi: 47, startSec: 0.6, durSec: 0.3, confidence: 0.8 },
      { midi: 40, startSec: 0.0, durSec: 0.5, confidence: 0.9 },
      { midi: 50, startSec: 0.7, durSec: 0.4, confidence: 0.95 },
      { midi: 45, startSec: 0.3, durSec: 0.5, confidence: 0.5 },
    ];
    const out = reduceToMonophonic(events);
    assertNonOverlapping(out);
    expect(out.map((n) => n.midi)).toEqual([40, 47, 50]);
  });

  it("drops sub-minimum and out-of-range notes", () => {
    const events: RawNoteEvent[] = [
      { midi: 40, startSec: 0, durSec: 0.01, confidence: 0.9 }, // too short
      { midi: 10, startSec: 0.2, durSec: 0.5, confidence: 0.9 }, // below range
      { midi: 200, startSec: 0.8, durSec: 0.5, confidence: 0.9 }, // above range
      { midi: MIDI_MIN, startSec: 1.5, durSec: 0.3, confidence: 0.9 },
      { midi: MIDI_MAX, startSec: 2.0, durSec: 0.3, confidence: 0.9 },
    ];
    const out = reduceToMonophonic(events);
    expect(out.map((n) => n.midi)).toEqual([MIDI_MIN, MIDI_MAX]);
  });

  it("is deterministic regardless of input order", () => {
    const events: RawNoteEvent[] = [
      { midi: 40, startSec: 0.0, durSec: 0.5, confidence: 0.9 },
      { midi: 45, startSec: 0.3, durSec: 0.5, confidence: 0.5 },
      { midi: 50, startSec: 0.7, durSec: 0.4, confidence: 0.95 },
    ];
    const a = reduceToMonophonic(events);
    const b = reduceToMonophonic([...events].reverse());
    expect(strip(a)).toEqual(strip(b));
  });

  it("ignores non-finite inputs", () => {
    const events: RawNoteEvent[] = [
      { midi: NaN, startSec: 0, durSec: 0.5, confidence: 0.9 },
      { midi: 40, startSec: Infinity, durSec: 0.5, confidence: 0.9 },
      { midi: 42, startSec: 0.0, durSec: 0.5, confidence: 0.9 },
    ];
    const out = reduceToMonophonic(events);
    expect(out).toHaveLength(1);
    expect(out[0].midi).toBe(42);
  });
});

describe("isClearEnough", () => {
  const line: Note[] = [
    { id: "a", midi: 40, startSec: 0, durSec: 0.5, confidence: 1, edited: false },
    { id: "b", midi: 42, startSec: 0.5, durSec: 0.5, confidence: 1, edited: false },
  ];

  it("is false for an empty result", () => {
    expect(isClearEnough([], 4)).toBe(false);
  });

  it("is false for negligible voicing", () => {
    const tiny: Note[] = [
      { id: "a", midi: 40, startSec: 0, durSec: 0.05, confidence: 1, edited: false },
    ];
    expect(isClearEnough(tiny, 4)).toBe(false);
  });

  it("is false for a non-positive region length", () => {
    expect(isClearEnough(line, 0)).toBe(false);
  });

  it("is true for a real line filling the region", () => {
    expect(isClearEnough(line, 2)).toBe(true);
  });
});
